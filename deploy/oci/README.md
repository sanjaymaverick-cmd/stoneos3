# Deploying StoneOS on Oracle Cloud (Always Free)

One Ampere A1 instance runs everything: Caddy, the app, and PostgreSQL.

**Read this first.** Putting the database on the same free instance as the app
is a deliberate choice with a real cost: this factory's production logs, sales
orders and expense history live on an instance Oracle can reclaim, on storage
nobody else is backing up. Everything below assumes that, and the backup setup
in step 8 is not optional decoration — it is the only thing standing between an
instance failure and starting the books again from paper. Do not skip it, and
do not skip the restore rehearsal.

---

## What you need before starting

- An OCI tenancy with Always Free eligibility.
- A domain name you control. Clerk production instances require one, and
  without it there is no TLS. You can start without a domain (see step 6) but
  do not run real data over plain HTTP.
- A Clerk **production** instance (`pk_live_` / `sk_live_`). The development
  keys the project has used so far will not work on a real domain. You will
  sign up through the deployed site partway through step 7 — the owner
  bootstrap grants access to an existing Clerk account, it does not create one.

## 1. Create the instance

Compute → Instances → Create.

- **Shape:** `VM.Standard.A1.Flex` with **4 OCPU / 24 GB** — the whole Always
  Free Ampere allocation. Take all of it: it is per-tenancy, this is the only
  instance, and unclaimed OCPUs are not banked for anything. The headroom is
  not wasted either, because images are built on this box and the Next.js
  production build is memory-hungry while Postgres is running beside it.
  A1.Flex can be resized later, but that needs a stop/start.
  Ampere is **aarch64** — this is why the Prisma schema carries
  `linux-musl-arm64-openssl-3.0.x`.
- **Image:** **Ubuntu 24.04 LTS (aarch64)**; 22.04 LTS is equally fine. Oracle
  Linux 9 works too, but Docker's install path and most of the documentation
  you will reach for mid-outage assume Ubuntu. The console filters images to
  aarch64 once the shape is A1.Flex.
- **Boot volume:** the 50 GB default. Keep the application data on the separate
  block volume in step 2, so rebuilding the instance does not touch it. That is
  100 GB of the 200 GB Always Free storage allowance, leaving headroom.
- **Save the SSH private key** at creation. It is shown once.

> **"Out of host capacity" is normal.** Ampere is heavily oversubscribed in
> popular regions. Try another availability domain, then another region, then
> try again later. It is a capacity queue, not a fault with your account.
>
> **The AMD `VM.Standard.E2.1.Micro` free shape is not a fallback.** At 1 GB
> RAM it cannot build this app — the Next.js build will run out of memory, and
> sharing that GB with Postgres would be worse. If Ampere stays unobtainable,
> the honest options are to keep retrying or to upgrade the account to Pay As
> You Go, which improves A1 capacity access while Always Free resources stay
> free. Do not lose an evening trying to make the micro shape work.
>
> **Do the retrying with `find-capacity.sh` rather than by hand** — see below.
> A micro instance is a perfectly good place to run it from.

### Hunting for A1 capacity

`find-capacity.sh` repeatedly attempts a real launch until one is accepted,
then exits. It does not check-then-launch, because Oracle exposes no dependable
capacity API for Always Free A1 and because capacity can be taken by someone
else between a check and a claim.

**Fastest way to start — OCI Cloud Shell.** The console you are already
signed into has a Cloud Shell (the `>_` icon, top right). Its `oci` CLI is
already authenticated as you, so there are no API keys to set up and nothing
to install. Paste this:

```bash
git clone https://github.com/sanjaymaverick-cmd/stoneos3.git
cd stoneos3/deploy/oci && ./find-capacity.sh
```

With no config file it discovers the compartment from `OCI_TENANCY`, picks a
subnet, resolves the newest Ubuntu 24.04 aarch64 image, and generates an SSH
keypair if you have none. **If it generates one, download the private key
(`~/.ssh/stoneos-a1`) before the Cloud Shell session ends — you cannot log
into the instance without it.**

The catch: Cloud Shell disconnects after roughly 20 minutes idle, so it is
good for a burst of attempts, not an overnight hunt. For that, run it on the
micro instance with the systemd unit below.

To pin any of the inputs instead of discovering them:

```bash
cp find-capacity.env.example find-capacity.env   # fill in the OCIDs
./find-capacity.sh
```

It validates every OCID and your credentials **once, up front, and treats those
as fatal** — only capacity is retried. A typo'd compartment OCID stops it
immediately rather than looping politely for a week.

It refuses to create a second instance: every round it checks for an existing
A1 in the compartment first, so a restart or a stray second copy cannot eat
your free allocation.

Set `NOTIFY_URL` to an [ntfy.sh](https://ntfy.sh) topic to get a phone alert.
Capacity tends to free up at unsociable hours.

To keep it running across reboots — ideally on the micro instance, which is
free and otherwise idle:

```bash
sudo cp stoneos-find-capacity.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stoneos-find-capacity
journalctl -u stoneos-find-capacity -f
```

**In a single-AD region there is nothing to rotate through.** `ap-mumbai-1` has
only AD-1, so "try another availability domain" is not advice you can act on
there — it is simply a waiting game. The script never pins a fault domain,
because Oracle's own capacity error says pinning one removes placements it
could otherwise have used. If days pass with no success, Pay As You Go is the
answer; Always Free resources remain free on it.

## 2. Attach a block volume

Storage → Block Volumes → Create (50 GB is generous; Always Free covers 200 GB
total including boot volumes). Attach it to the instance as **paravirtualized**,
then on the box:

```bash
lsblk                                     # find the device, e.g. /dev/sdb
sudo mkfs.ext4 /dev/sdb                   # ONLY if the volume is new and empty
sudo mkdir -p /mnt/stoneos-data
sudo mount /dev/sdb /mnt/stoneos-data
echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb) /mnt/stoneos-data ext4 defaults,_netdev,nofail 0 2" | sudo tee -a /etc/fstab
```

The volume is separate from the boot volume on purpose: rebuilding the
instance keeps the data.

## 3. Open the network — both halves

This is the step that costs people an afternoon. **Two** firewalls must be
opened, and opening one is not enough:

**a. VCN security list** (Networking → VCN → Security Lists) — add ingress
rules for TCP 80 and 443 from `0.0.0.0/0`.

**b. The host firewall.** OCI images ship with restrictive local rules:

```bash
# Ubuntu
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Oracle Linux
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

Leave SSH (22) as it is. Do **not** open 5432 — the database is not published
to the host at all, by design.

## 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # log out and back in for this to take effect
```

## 5. Get the code onto the box

```bash
sudo mkdir -p /opt/stoneos && sudo chown "$USER" /opt/stoneos
git clone https://github.com/sanjaymaverick-cmd/stoneos3.git /opt/stoneos
cd /opt/stoneos/deploy/oci
```

Images are built here rather than pulled from a registry. The box is aarch64
and builds aarch64, so there is no cross-architecture build to get wrong.

## 6. Configure

```bash
cp env.example .env
chmod 600 .env
$EDITOR .env
```

Generate each secret rather than inventing one:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

`POSTGRES_PASSWORD` and `COPILOT_DB_PASSWORD` must be different values, and
each must also be written into its matching connection string in the same
file.

Point your domain's A record at the instance's public IP **before** the first
start — Caddy requests a certificate on boot and Let's Encrypt rate-limits
repeated failures.

*No domain yet?* Set `DOMAIN=:80` and `PUBLIC_URL=http://<public-ip>` to come
up on plain HTTP. Fine for a first smoke test, not for real data — Clerk
session tokens would cross the network in the clear.

## 7. First deploy

**Order matters, and not in the obvious way.** The schema must exist before
the app connects — but the owner bootstrap has to come *last*, after the site
is up, because it grants access to a Clerk account that must already exist. It
looks you up in Clerk by email; it cannot create your account for you.

```bash
docker compose --env-file .env build

# 1. Schema. Postgres starts as a dependency and this waits for it to be healthy.
docker compose --profile tasks run --rm migrate

# 2. Give stoneos_copilot_ro its login. Migrations create that role
#    deliberately unusable (no password, no login) so no password is ever
#    committed; this is the only thing that turns it on.
docker compose --profile tasks run --rm provision-roles

# 3. Start the app.
docker compose --env-file .env up -d
docker compose ps
```

Check the backend is alive and can see the database:

```bash
curl -fsS https://your-domain/api/health   # {"status":"ok","database":"reachable"}
```

**Now — before the last step — open the site in a browser and sign up**, using
the email you want to own the factory. Sign-up is unrestricted; you just won't
be able to see anything useful yet, because you have no role.

```bash
# 4. Grant that account owner access and seed the B-21/LPM machines.
#    OWNER_EMAIL must match what you just signed up with.
OWNER_EMAIL=you@example.com docker compose --profile tasks run --rm bootstrap
```

Sign out and back in so Clerk reissues your session with the new metadata, then
confirm the dashboard loads.

> `bootstrap` writes an `app_user` row unconditionally, so it is not safe to
> re-run blindly for the same email — a second run will fail or duplicate.
> Re-run it only for a genuinely new owner. It *is* safe about the factory
> itself, reusing an existing one by name rather than creating a duplicate.

## 8. Backups — do this now, not later

```bash
sudo cp stoneos-backup.service stoneos-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stoneos-backup.timer
sudo systemctl start stoneos-backup.service     # run one immediately
journalctl -u stoneos-backup --no-pager | tail -20
```

`backup.sh` dumps the database, verifies the archive is actually readable,
uploads it to Object Storage via the pre-authenticated request in
`STONEOS_BACKUP_PAR_URL`, and prunes old local copies. It **fails loudly** if
the upload does not succeed, because a backup that only exists on this box
dies with this box.

To create the PAR: Storage → Buckets → your bucket → Pre-Authenticated
Requests → Create, target "Bucket", permission **Permit object writes**, and
set an expiry you will remember to renew. Copy the URL immediately — like the
SSH key, it is shown once. Add a lifecycle rule on the bucket to expire old
objects, so retention is enforced somewhere this box cannot reach.

**Rehearse the restore.** A backup you have never restored is a hypothesis:

```bash
STONEOS_RESTORE_DB=stoneos_probe ./restore.sh /mnt/stoneos-data/backups/<file>.dump
```

That restores into a scratch database and prints row counts. Check them
against what the business should have. Do this now, and again whenever the
schema changes materially.

### What this backup does and does not protect you from

| | |
|---|---|
| Instance lost, volume lost | Covered — restore from Object Storage onto a new box |
| Bad migration, accidental deletion | Covered back to the last nightly dump |
| Work entered since the last dump | **Lost.** Up to 24 hours |
| Corruption that predates the newest dump | Only if you kept enough history — check retention |

If losing a day of entries is unacceptable, run the timer hourly
(`OnCalendar=hourly`) or move the database to a managed provider with
point-in-time recovery. The application needs no code change for the latter:
row-level security is `ENABLE`d rather than `FORCE`d specifically so the app
never needs `BYPASSRLS` or superuser, which is what makes managed Postgres
possible.

## 9. Updating

```bash
cd /opt/stoneos && git pull
cd deploy/oci
docker compose --env-file .env build
docker compose --profile tasks run --rm migrate    # if migrations changed
docker compose --env-file .env up -d
```

Take a backup first when the release includes a migration —
`sudo systemctl start stoneos-backup.service` — since migrations are the
change most likely to need undoing.

---

## Operating notes

**Logs.** `docker compose logs -f backend` (or `frontend`, `caddy`,
`postgres`). Caddy's access log rolls inside `/data` on the block volume.

**Database shell.** `docker compose exec postgres psql -U stoneos -d stoneos`.
It is not reachable off the box; use an SSH tunnel if you need a GUI client.

**Restarts.** Everything is `restart: unless-stopped`, so the stack comes back
after a reboot. Verify after the first reboot rather than assuming.

**Disk.** Postgres, backups and Caddy's logs share the block volume. Watch it:
`df -h /mnt/stoneos-data`. A full disk stops Postgres accepting writes.

**Reclamation.** Oracle reclaims idle Always Free compute. An instance serving
real traffic is not idle, but the policy is theirs and it can change — which
is exactly why step 8 puts a copy of the data somewhere else.

## When something is wrong

| Symptom | Where to look |
|---|---|
| Site unreachable, no TLS | Both firewalls (step 3). Security list alone is not enough |
| Caddy loops on certificates | DNS not pointing here yet, or port 80 blocked. `docker compose logs caddy` |
| Backend restarts repeatedly | `docker compose logs backend` — usually `DATABASE_URL` or an unrun migration |
| Prisma dies on the first query | Wrong engine architecture — confirm `linux-musl-arm64-openssl-3.0.x` is in `schema.prisma` |
| Copilot answers "cannot connect" | `provision-roles` not run, or `COPILOT_DATABASE_URL` disagrees with `COPILOT_DB_PASSWORD` |
| Sign-in bounces | Development Clerk keys on a production domain, or `PUBLIC_URL` not matching the real address |
| `bootstrap` says "No Clerk account found" | You have not signed up through the site yet, or `OWNER_EMAIL` does not match the address you used. Bootstrap grants access to an existing account; it cannot create one |
| Signed in but the dashboard is empty | Bootstrap has not run, or you have not signed out and back in since it did — Clerk metadata is baked into the session |
