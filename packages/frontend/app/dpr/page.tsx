"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/session";
import { Factory, Save, Check, Play, Square } from "lucide-react";
import { apiFetch, safeGetToken } from "../../lib/api";
import { AppNav } from "../../components/AppNav";
import { Ticket } from "../../components/Ticket";

// BLOCK-CENTRIC PRODUCTION — the real workflow:
//   1. Allocate a raw block (by serial) to B-21  -> starts a CuttingSession
//   2. Each operational day (7am-7am), log runtime/power/slabs/downtime
//   3. Complete the session: enter total slabs cut + final good count (after
//      inspection) — the app bulk-generates all serials in one shot, e.g.
//      V101/50/01..V101/50/47 for 47 good out of 50 cut. Damaged slabs never
//      become inventory rows.
//   4. Record LPM polishing runs against specific slabs (glossy/leather)
// Daily DPR aggregates are DERIVED from these — never entered directly.

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function ProductionPage() {
  const { getToken } = useAuth();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  // Keyed by which form is saving, not global. Previously one `status` and one
  // `errorMsg` were shared by the allocate form and EVERY active session, so
  // saving session A disabled session B's button and an error from A appeared
  // to belong to B. Keys: "alloc", a session id for its day-log, and
  // `complete:<id>` for its completion form.
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});

  const beginSave = (key: string) => {
    setStatus((s) => ({ ...s, [key]: "saving" }));
    setErrorMsg((e) => ({ ...e, [key]: "" }));
  };
  const finishSave = (key: string, resetAfterMs = 1500) => {
    setStatus((s) => ({ ...s, [key]: "saved" }));
    setTimeout(() => setStatus((s) => ({ ...s, [key]: "idle" })), resetAfterMs);
  };
  const failSave = (key: string, message: string) => {
    setErrorMsg((e) => ({ ...e, [key]: message }));
    setStatus((s) => ({ ...s, [key]: "error" }));
  };

  const [allocBlockId, setAllocBlockId] = useState("");
  const [allocMachineId, setAllocMachineId] = useState("");
  const [expectedSlabCount, setExpectedSlabCount] = useState(""); // optional planning estimate only

  const defaultOpDate = () => {
    const d = new Date();
    if (d.getHours() < 7) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const [dayLogs, setDayLogs] = useState<Record<string, any>>({});
  const [completionForm, setCompletionForm] = useState<Record<string, any>>({});
  const [showCompleteFor, setShowCompleteFor] = useState<string | null>(null);
  const [completedResults, setCompletedResults] = useState<Record<string, any>>({});

  // Opt-in per-slab dimension overrides — rare mixed-size batch. Off by default;
  // when off the completion request is identical to the single-dimension-set path.
  const [slabOverridesEnabled, setSlabOverridesEnabled] = useState<Record<string, boolean>>({});
  const [slabOverrideRows, setSlabOverrideRows] = useState<Record<string, Record<number, any>>>({});

  const loadAll = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    const [blks, sess, machs] = await Promise.all([
      apiFetch("/raw-blocks", token),
      apiFetch("/cutting-sessions/active", token),
      apiFetch("/machines", token),
    ]);
    setBlocks(blks);
    setSessions(sess);
    setMachines(machs);
    if (!allocMachineId) {
      const b21 = machs.find((m: any) => m.machineType === "cutting");
      if (b21) setAllocMachineId(b21.id);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const inStockBlocks = blocks.filter((b) => b.currentStatus === "in_stock");
  const b21Machines = machines.filter((m) => m.machineType === "cutting");

  const allocate = async () => {
    if (!allocBlockId || !allocMachineId) {
      failSave("alloc", "Pick a block and the B-21");
      return;
    }
    beginSave("alloc");
    try {
      const token = await getToken();
      if (!token) throw new Error("not authenticated");
      await apiFetch("/cutting-sessions", token, {
        method: "POST",
        body: JSON.stringify({
          rawBlockId: allocBlockId,
          machineId: allocMachineId,
          expectedSlabCount: expectedSlabCount ? parseInt(expectedSlabCount) : undefined,
        }),
      });
      setAllocBlockId(""); setExpectedSlabCount("");
      await loadAll();
      finishSave("alloc");
    } catch (e: any) { failSave("alloc", e.message); }
  };

  const saveDayLog = async (sessionId: string) => {
    const log = dayLogs[sessionId] ?? {};
    beginSave(sessionId);
    try {
      const token = await getToken();
      if (!token) throw new Error("not authenticated");
      await apiFetch(`/cutting-sessions/${sessionId}/day-log`, token, {
        method: "POST",
        body: JSON.stringify({
          operationalDate: log.operationalDate ?? defaultOpDate(),
          runtimeHours: log.runtimeHours ? parseFloat(log.runtimeHours) : undefined,
          powerCutMinutes: log.powerCutMinutes ? parseInt(log.powerCutMinutes) : undefined,
          downtimeMinutes: log.downtimeMinutes ? parseInt(log.downtimeMinutes) : undefined,
          downtimeReason: log.downtimeReason || undefined,
          powerConsumptionKwh: log.powerConsumptionKwh ? parseFloat(log.powerConsumptionKwh) : undefined,
          slabsProducedCount: log.slabsProducedCount ? parseInt(log.slabsProducedCount) : undefined,
          notes: log.notes || undefined,
        }),
      });
      await loadAll();
      finishSave(sessionId);
    } catch (e: any) { failSave(sessionId, e.message); }
  };

  const updateCompletion = (sessionId: string, field: string, val: string) =>
    setCompletionForm((f) => ({ ...f, [sessionId]: { ...f[sessionId], [field]: val } }));

  const updateSlabOverrideRow = (sessionId: string, seq: number, field: string, val: string) =>
    setSlabOverrideRows((rows) => ({
      ...rows,
      [sessionId]: { ...rows[sessionId], [seq]: { ...rows[sessionId]?.[seq], [field]: val } },
    }));

  // Builds the minimal slabOverrides payload — only sequences whose values actually
  // differ from the session-level default make it in, and only the differing fields.
  const buildSlabOverrides = (sessionId: string, finalGoodSlabCount: number) => {
    const f = completionForm[sessionId] ?? {};
    const defaults = {
      lengthFt: f.lengthFt ? parseFloat(f.lengthFt) : undefined,
      widthFt: f.widthFt ? parseFloat(f.widthFt) : undefined,
      thicknessMm: f.thicknessMm ? parseFloat(f.thicknessMm) : undefined,
    };
    const overrides: { sequence: number; lengthFt?: number; widthFt?: number; thicknessMm?: number }[] = [];
    for (let seq = 1; seq <= finalGoodSlabCount; seq++) {
      const row = slabOverrideRows[sessionId]?.[seq] ?? {};
      const entry: { sequence: number; lengthFt?: number; widthFt?: number; thicknessMm?: number } = { sequence: seq };
      let differs = false;
      (["lengthFt", "widthFt", "thicknessMm"] as const).forEach((field) => {
        const raw = row[field];
        const parsed = raw !== undefined && raw !== "" ? parseFloat(raw) : undefined;
        if (parsed !== undefined && !Number.isNaN(parsed) && parsed !== defaults[field]) {
          entry[field] = parsed;
          differs = true;
        }
      });
      if (differs) overrides.push(entry);
    }
    return overrides;
  };

  const submitCompletion = async (sessionId: string) => {
    const f = completionForm[sessionId] ?? {};
    if (!f.totalSlabsCut || !f.finalGoodSlabCount) {
      failSave(`complete:${sessionId}`, "Enter both total slabs cut and final good count");
      return;
    }
    beginSave(`complete:${sessionId}`);
    try {
      const token = await getToken();
      if (!token) throw new Error("not authenticated");
      const finalGoodSlabCount = parseInt(f.finalGoodSlabCount);
      const overrides = slabOverridesEnabled[sessionId] ? buildSlabOverrides(sessionId, finalGoodSlabCount) : [];
      const result = await apiFetch(`/cutting-sessions/${sessionId}/complete`, token, {
        method: "POST",
        body: JSON.stringify({
          totalSlabsCut: parseInt(f.totalSlabsCut),
          finalGoodSlabCount,
          lengthFt: f.lengthFt ? parseFloat(f.lengthFt) : undefined,
          widthFt: f.widthFt ? parseFloat(f.widthFt) : undefined,
          thicknessMm: f.thicknessMm ? parseFloat(f.thicknessMm) : undefined,
          wastageNotes: f.wastageNotes || undefined,
          ...(overrides.length > 0 ? { slabOverrides: overrides } : {}),
        }),
      });
      setCompletedResults((r) => ({ ...r, [sessionId]: result }));
      setShowCompleteFor(null);
      setSlabOverridesEnabled((m) => ({ ...m, [sessionId]: false }));
      setSlabOverrideRows((rows) => ({ ...rows, [sessionId]: {} }));
      await loadAll();
      finishSave(`complete:${sessionId}`, 2500);
    } catch (e: any) { failSave(`complete:${sessionId}`, e.message); }
  };

  const updateLog = (sessionId: string, field: string, value: string) =>
    setDayLogs((l) => ({ ...l, [sessionId]: { ...l[sessionId], [field]: value } }));

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <h1 className="stamp-title">PRODUCTION — B-21</h1>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES · OPERATIONAL DAY = 7AM–7AM</div>
        </div>
        <AppNav />
      </div>

      <Ticket icon={Play} title="Allocate Block to B-21" subtitle="Starts a cutting session — block transitions to under_cutting">
        <div className="grid">
          <label className="field">
            <span className="field-label">Raw Block (in stock)</span>
            <select className="field-input" value={allocBlockId} onChange={(e) => setAllocBlockId(e.target.value)}>
              <option value="">Select…</option>
              {inStockBlocks.map((b) => (
                <option key={b.id} value={b.id}>{b.serialNumber} — {b.varietyName} ({b.weightTons}t)</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Machine (B-21)</span>
            <select className="field-input" value={allocMachineId} onChange={(e) => setAllocMachineId(e.target.value)}>
              <option value="">Select…</option>
              {b21Machines.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.bladeCount ? `(${m.bladeCount} blades)` : ""}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Expected Slabs (optional)</span>
            <input className="field-input" inputMode="numeric" value={expectedSlabCount} onChange={(e) => setExpectedSlabCount(e.target.value)} placeholder="rough estimate, e.g. 50" />
          </label>
        </div>
        {errorMsg.alloc && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 10 }}>{errorMsg.alloc}</div>}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button className="mini-btn" onClick={allocate} disabled={status.alloc === "saving"}>
            <Play size={14} /> {status.alloc === "saving" ? "Starting…" : "Start Cutting"}
          </button>
        </div>
      </Ticket>

      {sessions.map((s) => (
        <Ticket
          key={s.id}
          icon={Factory}
          title={`${s.rawBlock?.serialNumber} — ${s.rawBlock?.varietyName}`}
          subtitle={`On B-21 since ${new Date(s.startedAt).toLocaleDateString("en-IN")} · ${s.dayLogs?.length ?? 0} day log(s)`}
          accent="moss"
          action={
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="status-pill in_progress">in progress</span>
              <button className="mini-btn" onClick={() => setShowCompleteFor(showCompleteFor === s.id ? null : s.id)}>
                <Square size={13} /> Complete
              </button>
            </div>
          }
        >
          <div className="grid">
            <label className="field"><span className="field-label">Operational Date</span>
              <input className="field-input" type="date" value={dayLogs[s.id]?.operationalDate ?? defaultOpDate()} onChange={(e) => updateLog(s.id, "operationalDate", e.target.value)} />
            </label>
            <label className="field"><span className="field-label">Runtime (hrs)</span>
              <input className="field-input" inputMode="decimal" value={dayLogs[s.id]?.runtimeHours ?? ""} onChange={(e) => updateLog(s.id, "runtimeHours", e.target.value)} placeholder="19-22" />
            </label>
            <label className="field"><span className="field-label">Power Cut (min)</span>
              <input className="field-input" inputMode="numeric" value={dayLogs[s.id]?.powerCutMinutes ?? ""} onChange={(e) => updateLog(s.id, "powerCutMinutes", e.target.value)} placeholder="0" />
            </label>
            <label className="field"><span className="field-label">Downtime (min)</span>
              <input className="field-input" inputMode="numeric" value={dayLogs[s.id]?.downtimeMinutes ?? ""} onChange={(e) => updateLog(s.id, "downtimeMinutes", e.target.value)} placeholder="0" />
            </label>
            <label className="field"><span className="field-label">Downtime Reason</span>
              <select className="field-input" value={dayLogs[s.id]?.downtimeReason ?? ""} onChange={(e) => updateLog(s.id, "downtimeReason", e.target.value)}>
                <option value="">—</option>
                <option value="power_cut">Power cut</option>
                <option value="maintenance">Maintenance</option>
                <option value="breaks">Lunch/tea breaks</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field"><span className="field-label">Power (kWh)</span>
              <input className="field-input" inputMode="decimal" value={dayLogs[s.id]?.powerConsumptionKwh ?? ""} onChange={(e) => updateLog(s.id, "powerConsumptionKwh", e.target.value)} placeholder="0" />
            </label>
            <label className="field"><span className="field-label">Slabs Today</span>
              <input className="field-input" inputMode="numeric" value={dayLogs[s.id]?.slabsProducedCount ?? ""} onChange={(e) => updateLog(s.id, "slabsProducedCount", e.target.value)} placeholder="0" />
            </label>
            <label className="field"><span className="field-label">Notes</span>
              <input className="field-input" value={dayLogs[s.id]?.notes ?? ""} onChange={(e) => updateLog(s.id, "notes", e.target.value)} placeholder="Optional" />
            </label>
          </div>

          {errorMsg[s.id] && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 10 }}>{errorMsg[s.id]}</div>}
          <div style={{ marginTop: 12 }}>
            <button className="primary-btn" onClick={() => saveDayLog(s.id)} disabled={status[s.id] === "saving"}>
              {status[s.id] === "saved" ? <Check size={15} /> : <Save size={15} />}
              {status[s.id] === "saving" ? "Saving…" : status[s.id] === "saved" ? "Saved" : "Save Day Log"}
            </button>
          </div>

          {showCompleteFor === s.id && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed #C9C2B4" }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, textTransform: "uppercase", color: "var(--brass-dark)", marginBottom: 8 }}>
                Complete Cutting — enter after inspection
              </div>
              <div className="grid">
                <label className="field"><span className="field-label">Total Slabs Cut</span>
                  <input className="field-input" inputMode="numeric" value={completionForm[s.id]?.totalSlabsCut ?? ""} onChange={(e) => updateCompletion(s.id, "totalSlabsCut", e.target.value)} placeholder="e.g. 50" />
                </label>
                <label className="field"><span className="field-label">Final Good Slabs</span>
                  <input className="field-input" inputMode="numeric" value={completionForm[s.id]?.finalGoodSlabCount ?? ""} onChange={(e) => updateCompletion(s.id, "finalGoodSlabCount", e.target.value)} placeholder="e.g. 47" />
                </label>
                <label className="field"><span className="field-label">Length (ft, rough estimate)</span>
                  <input className="field-input" inputMode="decimal" value={completionForm[s.id]?.lengthFt ?? ""} onChange={(e) => updateCompletion(s.id, "lengthFt", e.target.value)} placeholder="e.g. 9" />
                </label>
                <label className="field"><span className="field-label">Width (ft, rough estimate)</span>
                  <input className="field-input" inputMode="decimal" value={completionForm[s.id]?.widthFt ?? ""} onChange={(e) => updateCompletion(s.id, "widthFt", e.target.value)} placeholder="e.g. 2.5" />
                </label>
                <label className="field"><span className="field-label">Thickness (mm)</span>
                  <input className="field-input" inputMode="decimal" value={completionForm[s.id]?.thicknessMm ?? ""} onChange={(e) => updateCompletion(s.id, "thicknessMm", e.target.value)} placeholder="18" />
                </label>
                <label className="field"><span className="field-label">Wastage Notes</span>
                  <input className="field-input" value={completionForm[s.id]?.wastageNotes ?? ""} onChange={(e) => updateCompletion(s.id, "wastageNotes", e.target.value)} placeholder="Optional" />
                </label>
              </div>
              <p style={{ fontSize: 11.5, color: "#6B6255", marginTop: 4 }}>
                Dimensions here are a rough placeholder for yard tracking only — the real measurement happens once, at sale.
              </p>
              {completionForm[s.id]?.totalSlabsCut && completionForm[s.id]?.finalGoodSlabCount && (
                <p style={{ fontSize: 12, color: "#6B6255", marginTop: 8 }}>
                  {parseInt(completionForm[s.id].totalSlabsCut) - parseInt(completionForm[s.id].finalGoodSlabCount)} damaged/broken —
                  won't enter inventory. Serials will run {s.rawBlock?.serialNumber}/{completionForm[s.id].totalSlabsCut}/01 through
                  …/{String(completionForm[s.id].finalGoodSlabCount).padStart(2, "0")}.
                </p>
              )}
              {(() => {
                const fgCount = parseInt(completionForm[s.id]?.finalGoodSlabCount ?? "");
                if (!fgCount || fgCount < 1) return null;
                return (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!slabOverridesEnabled[s.id]}
                        onChange={(e) => setSlabOverridesEnabled((m) => ({ ...m, [s.id]: e.target.checked }))}
                      />
                      different sizes for some slabs?
                    </label>
                    {slabOverridesEnabled[s.id] && (
                      <div style={{ marginTop: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                        {Array.from({ length: fgCount }, (_, i) => i + 1).map((seq) => (
                          <div className="row-card" key={seq}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brass-dark)", marginBottom: 6 }}>
                              Slab #{String(seq).padStart(2, "0")}
                            </div>
                            <div className="row-grid">
                              <label className="field"><span className="field-label">Length (ft)</span>
                                <input
                                  className="field-input"
                                  value={slabOverrideRows[s.id]?.[seq]?.lengthFt ?? completionForm[s.id]?.lengthFt ?? ""}
                                  onChange={(e) => updateSlabOverrideRow(s.id, seq, "lengthFt", e.target.value)}
                                />
                              </label>
                              <label className="field"><span className="field-label">Width (ft)</span>
                                <input
                                  className="field-input"
                                  value={slabOverrideRows[s.id]?.[seq]?.widthFt ?? completionForm[s.id]?.widthFt ?? ""}
                                  onChange={(e) => updateSlabOverrideRow(s.id, seq, "widthFt", e.target.value)}
                                />
                              </label>
                              <label className="field"><span className="field-label">Thickness (mm)</span>
                                <input
                                  className="field-input"
                                  value={slabOverrideRows[s.id]?.[seq]?.thicknessMm ?? completionForm[s.id]?.thicknessMm ?? ""}
                                  onChange={(e) => updateSlabOverrideRow(s.id, seq, "thicknessMm", e.target.value)}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {errorMsg[`complete:${s.id}`] && (
                <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 10 }}>{errorMsg[`complete:${s.id}`]}</div>
              )}
              <div style={{ marginTop: 10 }}>
                <button
                  className="primary-btn"
                  onClick={() => submitCompletion(s.id)}
                  disabled={status[`complete:${s.id}`] === "saving"}
                >
                  <Check size={14} />
                  {status[`complete:${s.id}`] === "saving" ? "Completing…" : "Confirm Completion"}
                </button>
              </div>
            </div>
          )}
        </Ticket>
      ))}

      {Object.entries(completedResults).map(([sessionId, result]: [string, any]) => (
        <Ticket
          key={sessionId}
          icon={Check}
          title={`Session completed — ${result.createdSlabs.length} slabs registered`}
          accent="moss"
          action={<span className="status-pill completed">completed</span>}
        >
          {result.damagedSlabCount > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--rust)" }}>{result.damagedSlabCount} damaged — excluded from inventory.</p>
          )}
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#555" }}>
            {result.createdSlabs.map((sl: any) => sl.slabSerial).join(", ")}
          </div>
        </Ticket>
      ))}

      {sessions.length === 0 && (
        <div className="ticket">
          <div className="ticket-notch left" /><div className="ticket-notch right" />
          <p style={{ margin: 0, color: "#6B6255", fontSize: 13.5 }}>
            No blocks on B-21 right now. Allocate one above to start a cutting session.
          </p>
        </div>
      )}

    </div>
  );
}
