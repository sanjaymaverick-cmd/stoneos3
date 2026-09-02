"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { ClipboardList, Package, Layers, Sparkles, CheckCircle2, Trash2 } from "lucide-react";
import { apiFetch, safeGetToken } from "../../../lib/api";
import { AppNav } from "../../../components/AppNav";

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// The five steps of the guided count. Step 0 starts it; 1-3 count each kind of
// stock; 4 reviews and submits. Kept as data so the progress strip and the
// panel below can never disagree about which step is current.
const STEPS = [
  { key: "start", label: "Start", icon: ClipboardList },
  { key: "blocks", label: "Raw Blocks", icon: Package },
  { key: "unpolished", label: "Unpolished", icon: Layers },
  { key: "polished", label: "Finished", icon: Sparkles },
  { key: "review", label: "Review", icon: CheckCircle2 },
] as const;

type Line = {
  id: string;
  inventoryKind: "RAW_BLOCK" | "UNPOLISHED_SLAB" | "POLISHED_SLAB";
  rawBlock?: { serialNumber: string; varietyName: string; weightTons?: string } | null;
  slab?: { slabSerial: string; varietyName: string } | null;
  location?: { name: string } | null;
  areaSqft?: string | null;
  openingValue?: string | null;
};

export default function OpeningInventoryPage() {
  const { getToken } = useAuth();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const call = async (path: string, options?: RequestInit) => {
    const token = await safeGetToken(getToken);
    if (!token) return null;
    return apiFetch(path, token, options);
  };

  const load = async () => {
    try {
      const current = await call("/opening-inventory");
      setSnapshot(current);
      // Drop the user back where the count actually is, rather than at step 0.
      if (current?.status === "SUBMITTED" || current?.status === "APPROVED") setStep(4);
      else if (current) setStep((s) => (s === 0 ? 1 : s));
      setError("");
    } catch (e: any) {
      setError(e.message ?? "Failed to load the opening count");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const lines: Line[] = snapshot?.lines ?? [];
  const linesOf = (kind: Line["inventoryKind"]) => lines.filter((l) => l.inventoryKind === kind);
  const readOnly = snapshot?.status && snapshot.status !== "DRAFT";

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <h1 className="stamp-title">OPENING INVENTORY</h1>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      {!loaded && <p className="loading-note" style={{ marginTop: 16 }}>Loading…</p>}

      {loaded && (
        <>
          <div className="ticket">
            <div className="ticket-notch left" /><div className="ticket-notch right" />
            <div className="nav-links" style={{ gap: 6 }}>
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = snapshot && i > 0 && i < step;
                return (
                  <button
                    key={s.key}
                    onClick={() => snapshot && setStep(i)}
                    disabled={!snapshot && i > 0}
                    className="mini-btn"
                    style={{
                      background: i === step ? "var(--brass-dark)" : done ? "#DCE6D3" : "var(--stone-200)",
                      color: i === step ? "white" : "var(--ink)",
                      borderColor: i === step ? "var(--brass-dark)" : "var(--stone-400)",
                      opacity: !snapshot && i > 0 ? 0.5 : 1,
                    }}
                  >
                    <Icon size={13} /> {i + 1}. {s.label}
                  </button>
                );
              })}
            </div>
            {snapshot && (
              <div className="totals-strip" style={{ justifyContent: "flex-start", borderTop: "none", paddingTop: 8 }}>
                <span className="label">Status</span>
                <span className="value" style={{ fontSize: 13 }}>{snapshot.status}</span>
                {snapshot.rejectionReason && (
                  <span className="label" style={{ color: "var(--rust)" }}>· {snapshot.rejectionReason}</span>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="ticket" style={{ borderColor: "var(--rust)" }}>
              <div className="ticket-notch left" /><div className="ticket-notch right" />
              <p className="loading-note" style={{ color: "var(--rust)" }}>{error}</p>
            </div>
          )}

          {step === 0 && !snapshot && <StartStep busy={busy} onStart={(countDate) =>
            act(() => call("/opening-inventory", { method: "POST", body: JSON.stringify({ countDate }) }))} />}

          {step === 1 && snapshot && (
            <BlockStep
              lines={linesOf("RAW_BLOCK")} busy={busy} readOnly={readOnly}
              onAdd={(body) => act(() => call(`/opening-inventory/${snapshot.id}/raw-blocks`, { method: "POST", body: JSON.stringify(body) }))}
              onRemove={(lineId) => act(() => call(`/opening-inventory/${snapshot.id}/lines/${lineId}`, { method: "DELETE" }))}
            />
          )}

          {(step === 2 || step === 3) && snapshot && (
            <SlabStep
              key={step}
              kind={step === 2 ? "UNPOLISHED_SLAB" : "POLISHED_SLAB"}
              lines={linesOf(step === 2 ? "UNPOLISHED_SLAB" : "POLISHED_SLAB")}
              busy={busy} readOnly={readOnly}
              onAdd={(body) => act(() => call(`/opening-inventory/${snapshot.id}/slabs`, { method: "POST", body: JSON.stringify(body) }))}
              onRemove={(lineId) => act(() => call(`/opening-inventory/${snapshot.id}/lines/${lineId}`, { method: "DELETE" }))}
            />
          )}

          {step === 4 && snapshot && (
            <ReviewStep
              snapshot={snapshot} busy={busy}
              onSubmit={() => act(() => call(`/opening-inventory/${snapshot.id}/submit`, { method: "POST" }))}
              onApprove={() => act(() => call(`/opening-inventory/${snapshot.id}/approve`, { method: "POST" }))}
              onReject={(reason) => act(() => call(`/opening-inventory/${snapshot.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }))}
            />
          )}
        </>
      )}
    </div>
  );
}

function Ticket({ icon: Icon, tone, title, subtitle, children }: any) {
  return (
    <div className="ticket">
      <div className="ticket-notch left" /><div className="ticket-notch right" />
      <div className="ticket-header">
        <div className={`ticket-icon ${tone}`}><Icon size={16} /></div>
        <div>
          <div className="ticket-title">{title}</div>
          <div className="ticket-subtitle">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function StartStep({ busy, onStart }: { busy: boolean; onStart: (d: string) => void }) {
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Ticket icon={ClipboardList} tone="brass" title="Start the opening count"
      subtitle="Record what is standing in the yard before the books begin">
      <p className="loading-note" style={{ marginBottom: 12 }}>
        This is counted once. Nothing is placed into stock until an owner or manager
        approves the finished count — until then you can add and remove freely.
      </p>
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="field-label" htmlFor="countDate">Count date</label>
        <input id="countDate" className="field-input" type="date" value={countDate}
          onChange={(e) => setCountDate(e.target.value)} />
      </div>
      <button className="primary-btn" style={{ marginTop: 14 }} disabled={busy || !countDate}
        onClick={() => onStart(countDate)}>
        {busy ? "Starting…" : "Start count"}
      </button>
    </Ticket>
  );
}

function BlockStep({ lines, busy, readOnly, onAdd, onRemove }: any) {
  const [form, setForm] = useState({ serialNumber: "", varietyName: "", weightTons: "", openingValue: "" });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const submit = () => {
    onAdd({
      serialNumber: form.serialNumber, varietyName: form.varietyName,
      weightTons: form.weightTons ? Number(form.weightTons) : undefined,
      openingValue: form.openingValue ? Number(form.openingValue) : undefined,
    });
    setForm({ serialNumber: "", varietyName: "", weightTons: "", openingValue: "" });
  };

  return (
    <Ticket icon={Package} tone="brass" title="Step 2 — Raw blocks" subtitle="Rough blocks standing in the yard">
      {!readOnly && (
        <>
          <div className="grid">
            <div className="field">
              <label className="field-label" htmlFor="bSerial">Block serial<span className="required-mark">*</span></label>
              <input id="bSerial" className="field-input" value={form.serialNumber} onChange={set("serialNumber")} placeholder="V101" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="bVariety">Variety<span className="required-mark">*</span></label>
              <input id="bVariety" className="field-input" value={form.varietyName} onChange={set("varietyName")} placeholder="Vedam Black" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="bWeight">Weight (tons)</label>
              <input id="bWeight" className="field-input" type="number" value={form.weightTons} onChange={set("weightTons")} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="bValue">Opening value</label>
              <input id="bValue" className="field-input" type="number" value={form.openingValue} onChange={set("openingValue")} />
            </div>
          </div>
          <button className="add-btn" disabled={busy || !form.serialNumber || !form.varietyName} onClick={submit}>
            + Add block
          </button>
        </>
      )}
      <CountedList
        rows={lines.map((l: Line) => ({
          id: l.id, serial: l.rawBlock?.serialNumber ?? "—", variety: l.rawBlock?.varietyName ?? "—",
          extra: l.rawBlock?.weightTons ? `${fmt(Number(l.rawBlock.weightTons))} t` : "—",
          value: l.openingValue, location: l.location?.name,
        }))}
        extraLabel="Weight" readOnly={readOnly} busy={busy} onRemove={onRemove}
        empty="No blocks counted yet."
      />
    </Ticket>
  );
}

function SlabStep({ kind, lines, busy, readOnly, onAdd, onRemove }: any) {
  const polished = kind === "POLISHED_SLAB";
  const [form, setForm] = useState({ slabSerial: "", varietyName: "", lengthFt: "", widthFt: "", openingValue: "" });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const submit = () => {
    onAdd({
      slabSerial: form.slabSerial, varietyName: form.varietyName, kind,
      lengthFt: form.lengthFt ? Number(form.lengthFt) : undefined,
      widthFt: form.widthFt ? Number(form.widthFt) : undefined,
      openingValue: form.openingValue ? Number(form.openingValue) : undefined,
    });
    setForm({ slabSerial: "", varietyName: "", lengthFt: "", widthFt: "", openingValue: "" });
  };

  return (
    <Ticket icon={polished ? Sparkles : Layers} tone={polished ? "moss" : "brass"}
      title={polished ? "Step 4 — Finished slabs" : "Step 3 — Unpolished slabs"}
      subtitle={polished ? "Polished stock ready to sell" : "Cut but not yet polished"}>
      {!readOnly && (
        <>
          <div className="grid">
            <div className="field">
              <label className="field-label" htmlFor={`${kind}-serial`}>Slab serial<span className="required-mark">*</span></label>
              <input id={`${kind}-serial`} className="field-input" value={form.slabSerial} onChange={set("slabSerial")} placeholder="V101/50/01" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${kind}-variety`}>Variety<span className="required-mark">*</span></label>
              <input id={`${kind}-variety`} className="field-input" value={form.varietyName} onChange={set("varietyName")} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${kind}-len`}>Length (ft)</label>
              <input id={`${kind}-len`} className="field-input" type="number" value={form.lengthFt} onChange={set("lengthFt")} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${kind}-wid`}>Width (ft)</label>
              <input id={`${kind}-wid`} className="field-input" type="number" value={form.widthFt} onChange={set("widthFt")} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${kind}-val`}>Opening value</label>
              <input id={`${kind}-val`} className="field-input" type="number" value={form.openingValue} onChange={set("openingValue")} />
            </div>
          </div>
          <button className="add-btn" disabled={busy || !form.slabSerial || !form.varietyName} onClick={submit}>
            + Add slab
          </button>
        </>
      )}
      <CountedList
        rows={lines.map((l: Line) => ({
          id: l.id, serial: l.slab?.slabSerial ?? "—", variety: l.slab?.varietyName ?? "—",
          extra: l.areaSqft ? `${fmt(Number(l.areaSqft))} sqft` : "—",
          value: l.openingValue, location: l.location?.name,
        }))}
        extraLabel="Area" readOnly={readOnly} busy={busy} onRemove={onRemove}
        empty="No slabs counted yet."
      />
    </Ticket>
  );
}

function CountedList({ rows, extraLabel, readOnly, busy, onRemove, empty }: any) {
  if (rows.length === 0) return <p className="empty-note" style={{ marginTop: 14 }}>{empty}</p>;
  return (
    <div className="table-scroll">
      <table className="list-table">
        <thead>
          <tr>
            <th>Serial</th><th>Variety</th><th>{extraLabel}</th><th>Value</th><th>Location</th>
            {!readOnly && <th aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>{r.serial}</td>
              <td>{r.variety}</td>
              <td>{r.extra}</td>
              <td>{r.value ? fmt(Number(r.value)) : "—"}</td>
              <td>{r.location ?? "—"}</td>
              {!readOnly && (
                <td>
                  <button className="row-remove" style={{ position: "static" }} disabled={busy}
                    aria-label={`Remove ${r.serial}`} onClick={() => onRemove(r.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewStep({ snapshot, busy, onSubmit, onApprove, onReject }: any) {
  const [reason, setReason] = useState("");
  const t = snapshot.totals ?? {};
  const stat = (label: string, value: string) => (
    <div className="stat-card" key={label}>
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <Ticket icon={CheckCircle2} tone={snapshot.status === "APPROVED" ? "moss" : "brass"}
      title="Step 5 — Review and approve"
      subtitle="Approving places every counted item into stock and makes the factory live">
      <div className="stat-row">
        {stat("Raw blocks", String(t.rawBlocks?.count ?? 0))}
        {stat("Unpolished slabs", String(t.unpolishedSlabs?.count ?? 0))}
        {stat("Finished slabs", String(t.polishedSlabs?.count ?? 0))}
        {stat("Opening value", fmt(Number(t.openingValue ?? 0)))}
      </div>

      {snapshot.status === "DRAFT" && (
        <button className="primary-btn" style={{ marginTop: 16 }} disabled={busy} onClick={onSubmit}>
          {busy ? "Submitting…" : "Submit for approval"}
        </button>
      )}

      {snapshot.status === "SUBMITTED" && (
        <>
          <p className="loading-note" style={{ marginTop: 16 }}>
            Waiting on approval. Whoever approves must be someone other than the person
            who entered the count.
          </p>
          <div className="field" style={{ marginTop: 12, maxWidth: 360 }}>
            <label className="field-label" htmlFor="rejectReason">Reason (required to send back)</label>
            <input id="rejectReason" className="field-input" value={reason}
              onChange={(e) => setReason(e.target.value)} placeholder="Recount the raw yard" />
          </div>
          <div className="nav-links" style={{ marginTop: 12 }}>
            <button className="primary-btn" disabled={busy} onClick={onApprove}>
              {busy ? "Approving…" : "Approve and go live"}
            </button>
            <button className="mini-btn" disabled={busy || !reason.trim()} onClick={() => onReject(reason)}>
              Send back
            </button>
          </div>
        </>
      )}

      {snapshot.status === "APPROVED" && (
        <p className="loading-note" style={{ marginTop: 16 }}>
          Approved. Every counted item is now in stock and the factory is live.
        </p>
      )}

      {snapshot.status === "REJECTED" && (
        <p className="loading-note" style={{ marginTop: 16, color: "var(--rust)" }}>
          Sent back: {snapshot.rejectionReason}. Return to the earlier steps to correct the count.
        </p>
      )}
    </Ticket>
  );
}
