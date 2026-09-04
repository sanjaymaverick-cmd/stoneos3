#!/usr/bin/env bash
# Oracle Cloud Ampere A1 capacity hunter.
#
# Oracle exposes no dependable "is there capacity" API for Always Free A1, so
# this does not check-then-launch — it repeatedly ATTEMPTS a real launch until
# one is accepted. That also closes the race where capacity appears and is
# taken by someone else between a check and a claim.
#
# It exits the moment an instance is created. It will not create a second one:
# before every attempt it looks for an existing A1 instance in the compartment
# and stops if it finds one, so a systemd restart or a second copy of this
# script cannot spend your whole free allocation.
#
# Run it somewhere always-on. The E2.1.Micro is ideal — free, already running,
# and useless for much else.
#
#   cp find-capacity.env.example find-capacity.env   # then fill it in
#   ./find-capacity.sh
#
# Notes on regions with ONE availability domain (ap-mumbai-1 is one): there is
# nothing to rotate through, so this becomes a patient retry on the single AD.
# It never pins a fault domain — Oracle's own capacity error advises against
# it, since pinning removes placements it could otherwise have used.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# The config file is OPTIONAL. In OCI Cloud Shell everything below can be
# discovered, so `./find-capacity.sh` with no setup at all is a valid way to
# run this. Provide find-capacity.env when you want to pin any of it.
CONFIG="${1:-$SCRIPT_DIR/find-capacity.env}"
if [ -f "$CONFIG" ]; then
    # shellcheck disable=SC1090
    set -a; . "$CONFIG"; set +a
fi

SHAPE="${SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${OCPUS:-4}"
MEMORY_GB="${MEMORY_GB:-24}"
BOOT_VOLUME_GB="${BOOT_VOLUME_GB:-50}"
DISPLAY_NAME="${DISPLAY_NAME:-stoneos-a1}"
OS_NAME="${OS_NAME:-Canonical Ubuntu}"
OS_VERSION="${OS_VERSION:-24.04}"
# 60s is deliberate. Oracle rate-limits, and a tighter loop earns 429s that
# make you slower, not faster. Do not drop this below ~30.
INTERVAL="${INTERVAL:-60}"
JITTER="${JITTER:-20}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/find-capacity.log}"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"; }

notify() {
    # Optional. NOTIFY_URL is posted to on success — an ntfy.sh topic, a Slack
    # webhook, anything that takes a POST body. Capacity usually frees up at
    # antisocial hours, so this is how you find out without watching a log.
    [ -n "${NOTIFY_URL:-}" ] || return 0
    curl --fail --silent --show-error --max-time 20 \
        -d "$1" "$NOTIFY_URL" >/dev/null 2>&1 || log "WARN: notification failed"
}

command -v oci >/dev/null || { echo "The oci CLI is not installed or not on PATH." >&2; exit 2; }

# ---- preflight -------------------------------------------------------------
# Everything that can be wrong about the CONFIG is checked once, now, and is
# fatal. Only capacity is retried. Otherwise a typo'd OCID means looping
# politely for a week and learning nothing.

log "Preflight: checking credentials and resolving inputs"

# Cloud Shell exports OCI_TENANCY and is pre-authenticated as you, so the root
# compartment is a sound default there. Elsewhere it has to be given.
if [ -z "${COMPARTMENT_ID:-}" ]; then
    COMPARTMENT_ID="${OCI_TENANCY:-}"
    [ -n "$COMPARTMENT_ID" ] \
        || { echo "COMPARTMENT_ID is not set and OCI_TENANCY is not available. Set it in find-capacity.env." >&2; exit 2; }
    log "Compartment: using tenancy root from OCI_TENANCY"
fi

# A keypair is required to ever log in to the instance. Generating one is
# better than failing, but the PRIVATE half is the thing you must keep — in
# Cloud Shell, download it before the session goes away.
if [ -z "${SSH_PUBLIC_KEY_FILE:-}" ]; then
    SSH_PUBLIC_KEY_FILE="$HOME/.ssh/stoneos-a1.pub"
    if [ ! -f "$SSH_PUBLIC_KEY_FILE" ]; then
        log "No SSH key given; generating $HOME/.ssh/stoneos-a1"
        mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
        ssh-keygen -t ed25519 -N "" -C "stoneos-a1" -f "$HOME/.ssh/stoneos-a1" >/dev/null
        log "KEEP THIS: $HOME/.ssh/stoneos-a1 is the private key. Download it — you cannot log in without it."
    fi
fi

ADS="$(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" \
        --query 'data[].name' --raw-output 2>/dev/null | tr -d '[]"' | tr ',' '\n' | sed '/^\s*$/d')" \
    || { echo "Could not list availability domains. Is 'oci setup config' done and the compartment OCID right?" >&2; exit 2; }
[ -n "$ADS" ] || { echo "No availability domains returned for this compartment." >&2; exit 2; }
AD_COUNT="$(echo "$ADS" | wc -l | tr -d ' ')"
log "Availability domains ($AD_COUNT): $(echo "$ADS" | tr '\n' ' ')"
[ "$AD_COUNT" = "1" ] && log "Single-AD region — nothing to rotate through, so this is a patient retry."

# Any subnet that assigns public IPs will do. Picking the first one is right
# for a tenancy with a single VCN; pin SUBNET_ID if you have several.
if [ -z "${SUBNET_ID:-}" ]; then
    log "Resolving a subnet"
    SUBNET_ID="$(oci network subnet list --compartment-id "$COMPARTMENT_ID" \
        --query 'data[0].id' --raw-output 2>/dev/null)" || SUBNET_ID=""
    [ -n "$SUBNET_ID" ] && [ "$SUBNET_ID" != "null" ] \
        || { echo "No subnet found. Create a VCN with a public subnet first, or set SUBNET_ID." >&2; exit 2; }
fi
log "Subnet: $SUBNET_ID"

if [ -z "${IMAGE_ID:-}" ]; then
    log "Resolving newest $OS_NAME $OS_VERSION image for $SHAPE"
    IMAGE_ID="$(oci compute image list --compartment-id "$COMPARTMENT_ID" \
        --operating-system "$OS_NAME" --operating-system-version "$OS_VERSION" \
        --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC --limit 1 \
        --query 'data[0].id' --raw-output 2>/dev/null)" || IMAGE_ID=""
    [ -n "$IMAGE_ID" ] && [ "$IMAGE_ID" != "null" ] \
        || { echo "Could not resolve an image. Set IMAGE_ID explicitly." >&2; exit 2; }
fi
log "Image: $IMAGE_ID"
[ -f "$SSH_PUBLIC_KEY_FILE" ] || { echo "SSH public key not found: $SSH_PUBLIC_KEY_FILE" >&2; exit 2; }
log "SSH key: $SSH_PUBLIC_KEY_FILE"

# ---- duplicate guard -------------------------------------------------------
existing_a1() {
    oci compute instance list --compartment-id "$COMPARTMENT_ID" \
        --query "data[?\"shape\"=='$SHAPE' && (\"lifecycle-state\"=='RUNNING' || \"lifecycle-state\"=='PROVISIONING' || \"lifecycle-state\"=='STARTING')].\"display-name\"" \
        --raw-output 2>/dev/null | tr -d '[]" ' | sed '/^\s*$/d'
}

if found="$(existing_a1)" && [ -n "$found" ]; then
    log "An $SHAPE instance already exists ($found). Nothing to do — refusing to create another."
    exit 0
fi

log "Hunting for $SHAPE ${OCPUS} OCPU / ${MEMORY_GB} GB. Interval ${INTERVAL}s (+0-${JITTER}s jitter)."
log "Leave this running. It exits by itself the moment an instance is created."

ATTEMPT=0
while true; do
    ATTEMPT=$((ATTEMPT + 1))

    while IFS= read -r AD; do
        [ -n "$AD" ] || continue

        set +e
        OUT="$(oci compute instance launch \
            --availability-domain "$AD" \
            --compartment-id "$COMPARTMENT_ID" \
            --shape "$SHAPE" \
            --shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEMORY_GB}" \
            --image-id "$IMAGE_ID" \
            --subnet-id "$SUBNET_ID" \
            --assign-public-ip true \
            --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
            --display-name "$DISPLAY_NAME" \
            --ssh-authorized-keys-file "$SSH_PUBLIC_KEY_FILE" \
            2>&1)"
        RC=$?
        set -e

        if [ $RC -eq 0 ]; then
            OCID="$(echo "$OUT" | grep -o '"id": "ocid1\.instance[^"]*"' | head -1 | cut -d'"' -f4)"
            log "SUCCESS on attempt $ATTEMPT in $AD"
            log "Instance: ${OCID:-<see output>}"
            echo "$OUT" >> "$LOG_FILE"
            notify "StoneOS: Ampere A1 instance created in $AD after $ATTEMPT attempts. OCID: ${OCID:-unknown}"
            log "Public IP appears once it reaches RUNNING:"
            log "  oci compute instance list-vnics --instance-id ${OCID:-<ocid>} --query 'data[0].\"public-ip\"' --raw-output"
            exit 0
        fi

        # Capacity is the ONLY thing worth retrying. Everything else is a
        # standing condition that will not resolve by waiting.
        if echo "$OUT" | grep -qiE 'out of (host )?capacity'; then
            log "attempt $ATTEMPT  $AD  no capacity"
        elif echo "$OUT" | grep -qiE 'TooManyRequests|429'; then
            # Backing off hard here is self-interested: staying rate-limited
            # means the next real opening gets refused too.
            log "attempt $ATTEMPT  $AD  rate limited — backing off 5 minutes"
            sleep 300
        elif echo "$OUT" | grep -qiE 'LimitExceeded'; then
            log "FATAL: service limit exceeded. You have already used your A1 allocation"
            log "       (Always Free is 4 OCPU / 24 GB in total). Free or reduce it; retrying cannot help."
            echo "$OUT" >> "$LOG_FILE"
            notify "StoneOS capacity hunter stopped: A1 service limit exceeded."
            exit 1
        elif echo "$OUT" | grep -qiE 'NotAuthenticated|NotAuthorizedOrNotFound|InvalidParameter|CannotParseRequest'; then
            log "FATAL: request rejected for a reason that will not change:"
            echo "$OUT" | head -20 | tee -a "$LOG_FILE"
            notify "StoneOS capacity hunter stopped: configuration or auth error."
            exit 1
        else
            log "attempt $ATTEMPT  $AD  unrecognised error (treating as retryable):"
            echo "$OUT" | head -5 | tee -a "$LOG_FILE"
        fi
    done <<< "$ADS"

    sleep $((INTERVAL + RANDOM % (JITTER + 1)))
done
