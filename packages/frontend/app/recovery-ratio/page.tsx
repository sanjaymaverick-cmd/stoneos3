"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Gauge } from "lucide-react";
import { apiFetch, safeGetToken } from "../../lib/api";
import { AppNav } from "../../components/AppNav";

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function RecoveryRatioPage() {
  const { getToken } = useAuth();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadBlocks = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    setBlocks(await apiFetch("/raw-blocks/recovery-ratio", token));
    setLoaded(true);
  };

  useEffect(() => { loadBlocks(); }, []);

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <div className="stamp-title">RECOVERY RATIO</div>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      <div className="ticket">
        <div className="ticket-notch left" /><div className="ticket-notch right" />
        <div className="ticket-header">
          <div className="ticket-icon brass"><Gauge size={16} /></div>
          <div>
            <div className="ticket-title">Recovery Ratio by Block</div>
            <div className="ticket-subtitle">Sale-time sqft sold per ton of rough block — benchmark 105 sqft/ton</div>
          </div>
        </div>

        <table className="list-table">
          <thead>
            <tr>
              <th>Serial</th>
              <th>Variety</th>
              <th>Weight (t)</th>
              <th>Sold Sqft</th>
              <th>Recovery Ratio</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id}>
                <td className="mono">{b.serialNumber}</td>
                <td style={{ fontFamily: "Space Grotesk" }}>{b.varietyName}</td>
                <td className="mono">{b.weightTons != null ? fmt(Number(b.weightTons)) : "—"}</td>
                <td className="mono">{fmt(Number(b.soldSqft))}</td>
                <td className="mono">{b.recoveryRatio != null ? fmt(Number(b.recoveryRatio)) : "—"}</td>
                <td>
                  {b.recoveryRatio == null ? (
                    <span className="badge mixed">no sales yet</span>
                  ) : b.belowBenchmark ? (
                    <span className="badge cash">below benchmark</span>
                  ) : (
                    <span className="badge invoiced">on target</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loaded && blocks.length === 0 && (
          <div style={{ padding: "18px 4px", fontSize: 12.5, color: "#857c6c", fontFamily: "IBM Plex Mono, monospace" }}>
            No raw blocks recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
