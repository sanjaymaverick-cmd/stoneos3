"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Gauge, Save, Check } from "lucide-react";
import { apiFetch, safeGetToken } from "../../lib/api";
import { AppNav } from "../../components/AppNav";
import { Ticket } from "../../components/Ticket";

// LPM POLISHING — records one automated batch run against specific slabs.
// Per business rule (confirmed): once a slab clears cutting and enters
// this batch, it is ALWAYS sellable afterward, even if a surface defect
// is found during/after polishing — LPM's automated batch/liner assembly
// can't selectively exclude mid-batch anyway, and internal stone defects
// are often only visible once polished. This page has no rejection step
// by design — see Slab.qualityNote in the schema for how a found defect
// should be handled (pricing note, never inventory exclusion).

export default function PolishingPage() {
  const { getToken } = useAuth();
  const [slabs, setSlabs] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const defaultOpDate = () => {
    const d = new Date();
    if (d.getHours() < 7) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const [operationalDate, setOperationalDate] = useState(defaultOpDate());
  const [machineId, setMachineId] = useState("");
  const [finishType, setFinishType] = useState<"glossy" | "leather">("glossy");
  const [selectedSlabIds, setSelectedSlabIds] = useState<string[]>([]);
  const [runtimeHours, setRuntimeHours] = useState("");
  const [powerKwh, setPowerKwh] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [downtimeReason, setDowntimeReason] = useState("");
  const [notes, setNotes] = useState("");

  const loadAll = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    try {
      const [slabList, machineList, sessionList] = await Promise.all([
        apiFetch("/slabs", token),
        apiFetch("/machines", token),
        apiFetch(`/polishing-sessions?date=${operationalDate}`, token),
      ]);
      setSlabs(slabList);
      setMachines(machineList);
      setSessions(sessionList);
      const lpm = machineList.find((m: any) => m.machineType === "polishing");
      if (lpm && !machineId) setMachineId(lpm.id);
      setLoadError("");
    } catch (e: any) {
      setLoadError(e.message ?? "Failed to load polishing data");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { loadAll(); }, [operationalDate]);

  // Only slabs that are cut and waiting — i.e. not yet polished or sold.
  const eligibleSlabs = slabs.filter((s) => s.salesStatus === "in_stock");
  const lpmMachines = machines.filter((m) => m.machineType === "polishing");
  const selectedMachine = machines.find((m) => m.id === machineId);

  const toggleSlab = (id: string) =>
    setSelectedSlabIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const submit = async () => {
    if (!machineId || selectedSlabIds.length === 0) {
      setErrorMsg("Pick the LPM and at least one slab");
      setStatus("error");
      return;
    }
    setStatus("saving"); setErrorMsg("");
    try {
      const token = await getToken();
      if (!token) throw new Error("not authenticated");
      await apiFetch("/polishing-sessions", token, {
        method: "POST",
        body: JSON.stringify({
          machineId,
          operationalDate,
          finishType,
          slabIds: selectedSlabIds,
          runtimeHours: runtimeHours ? parseFloat(runtimeHours) : undefined,
          powerConsumptionKwh: powerKwh ? parseFloat(powerKwh) : undefined,
          downtimeMinutes: downtimeMinutes ? parseInt(downtimeMinutes) : undefined,
          downtimeReason: downtimeReason || undefined,
          notes: notes || undefined,
        }),
      });
      setSelectedSlabIds([]);
      setRuntimeHours(""); setPowerKwh(""); setDowntimeMinutes(""); setDowntimeReason(""); setNotes("");
      await loadAll();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1800);
    } catch (e: any) { setErrorMsg(e.message); setStatus("error"); }
  };

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <h1 className="stamp-title">POLISHING — LPM</h1>
          <div className="stamp-sub">
            STONEOS · VEDAM GRANITES{selectedMachine?.headCount ? ` · ${selectedMachine.headCount} heads × ${selectedMachine.abrasivesPerHead ?? 6} abrasives` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="date-box">
            <input
              type="date"
              aria-label="Operational date"
              value={operationalDate}
              onChange={(e) => setOperationalDate(e.target.value)}
            />
          </div>
          <AppNav />
        </div>
      </div>

      <Ticket icon={Gauge} title="New Polishing Run" subtitle="One automated batch — all selected slabs get the same finish" accent="moss">
        <div className="grid">
          <label className="field"><span className="field-label">Machine (LPM)</span>
            <select className="field-input" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
              <option value="">Select…</option>
              {lpmMachines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">Finish</span>
            <select className="field-input" value={finishType} onChange={(e) => setFinishType(e.target.value as any)}>
              <option value="glossy">Glossy</option>
              <option value="leather">Leather</option>
            </select>
          </label>
          <label className="field"><span className="field-label">Runtime (hrs)</span>
            <input className="field-input" value={runtimeHours} onChange={(e) => setRuntimeHours(e.target.value)} placeholder="0" />
          </label>
          <label className="field"><span className="field-label">Power (kWh)</span>
            <input className="field-input" value={powerKwh} onChange={(e) => setPowerKwh(e.target.value)} placeholder="0" />
          </label>
          <label className="field"><span className="field-label">Downtime (min)</span>
            <input className="field-input" value={downtimeMinutes} onChange={(e) => setDowntimeMinutes(e.target.value)} placeholder="0" />
          </label>
          <label className="field"><span className="field-label">Downtime Reason</span>
            <input className="field-input" value={downtimeReason} onChange={(e) => setDowntimeReason(e.target.value)} placeholder="Optional" />
          </label>
          <label className="field"><span className="field-label">Notes</span>
            <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Select Slabs Awaiting Polish ({selectedSlabIds.length} selected)
          </div>
          {!loaded ? (
            <p className="loading-note">Loading…</p>
          ) : loadError ? (
            <p style={{ color: "var(--rust)", fontSize: 13 }}>Couldn't load slabs: {loadError}</p>
          ) : eligibleSlabs.length === 0 ? (
            <p className="empty-note">No slabs currently in_stock. Complete a cutting session first.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {eligibleSlabs.map((s) => (
                <label
                  key={s.id}
                  className="row-card"
                  style={{
                    margin: 0, padding: "12px 10px", minHeight: 44, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    borderColor: selectedSlabIds.includes(s.id) ? "var(--brass)" : "var(--stone-300)",
                    background: selectedSlabIds.includes(s.id) ? "#F3ECE2" : "white",
                  }}
                >
                  <input type="checkbox" checked={selectedSlabIds.includes(s.id)} onChange={() => toggleSlab(s.id)} />
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.slabSerial}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {errorMsg && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 10 }}>{errorMsg}</div>}

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button className={`primary-btn ${status === "saved" ? "saved" : ""}`} onClick={submit} disabled={status === "saving"}>
            {status === "saved" ? <Check size={15} /> : <Save size={15} />}
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Record Polishing Run"}
          </button>
        </div>
      </Ticket>

      <Ticket icon={Gauge} title={`Runs on ${operationalDate}`}>
        {!loaded ? (
          <p className="loading-note">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="empty-note">No polishing runs recorded for this date yet.</p>
        ) : null}
        {loaded && sessions.map((s) => (
          <div className="row-card" key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className={`badge ${s.finishType === "glossy" ? "invoiced" : "mixed"}`}>{s.finishType}</span>
              <span style={{ fontSize: 12, color: "#6B6255" }}>{s.slabsPolishedCount} slabs · {s.runtimeHours ?? "?"} hrs</span>
            </div>
            <div style={{ fontSize: 11.5, fontFamily: "monospace", color: "#555", marginTop: 6 }}>
              {(s.slabs ?? []).map((ss: any) => ss.slab?.slabSerial).join(", ")}
            </div>
          </div>
        ))}
      </Ticket>
    </div>
  );
}
