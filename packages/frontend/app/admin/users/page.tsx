"use client";

import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { Users, UserPlus, Save, Check } from "lucide-react";
import { apiFetch, safeGetToken } from "../../../lib/api";
import { AppNav } from "../../../components/AppNav";
import { Ticket } from "../../../components/Ticket";

// Matches app_user.role check constraint in the schema — keep in sync.
const ROLES = ["owner", "manager", "supervisor", "operator", "accountant", "auditor", "admin"];

export default function AdminUsersPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const myRole = user?.publicMetadata?.role as string | undefined;
  const canAdminister = myRole === "owner" || myRole === "admin";

  const [users, setUsers] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("supervisor");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadUsers = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    try {
      const list = await apiFetch("/admin/users", token);
      setUsers(list);
    } catch (e: any) {
      // A non-admin hitting this is expected (403) — the page already
      // hides the UI for them, this just avoids a console-scary failure.
    }
    setLoaded(true);
  };

  useEffect(() => { if (canAdminister) loadUsers(); else setLoaded(true); }, [canAdminister]);

  const provision = async () => {
    if (!email.trim()) {
      setErrorMsg("Enter the teammate's email — they need to have signed up already");
      setStatus("error");
      return;
    }
    setStatus("saving"); setErrorMsg("");
    try {
      const token = await getToken();
      if (!token) throw new Error("not authenticated");
      await apiFetch("/admin/users", token, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setEmail("");
      await loadUsers();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1800);
    } catch (e: any) {
      setErrorMsg(
        e.message?.includes("404")
          ? "No account found for that email — they need to sign up in the app first, then try again."
          : e.message ?? "Failed to provision",
      );
      setStatus("error");
    }
  };

  if (!loaded) {
    return (
      <div className="app-shell">
        <div className="stamp">
          <div><div className="stamp-title">TEAM ACCESS</div></div>
          <AppNav />
        </div>
        <div className="ticket"><div className="ticket-notch left" /><div className="ticket-notch right" /><p>Loading…</p></div>
      </div>
    );
  }

  if (!canAdminister) {
    return (
      <div className="app-shell">
        <div className="stamp">
          <div><div className="stamp-title">TEAM ACCESS</div></div>
          <AppNav />
        </div>
        <div className="ticket">
          <div className="ticket-notch left" /><div className="ticket-notch right" />
          <p style={{ margin: 0 }}>This page is only visible to owners and admins. Ask yours for access if you need it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <div className="stamp-title">TEAM ACCESS</div>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      <Ticket icon={UserPlus} title="Grant Access" subtitle="They must sign up in the app first — this step turns that account into real access" accent="moss">
        <div className="grid">
          <label className="field" style={{ gridColumn: "span 2" }}>
            <span className="field-label">Teammate's Email</span>
            <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="field">
            <span className="field-label">Role</span>
            <select className="field-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        {errorMsg && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: 10 }}>{errorMsg}</div>}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button className={`primary-btn ${status === "saved" ? "saved" : ""}`} onClick={provision} disabled={status === "saving"}>
            {status === "saved" ? <Check size={15} /> : <Save size={15} />}
            {status === "saving" ? "Granting…" : status === "saved" ? "Granted" : "Grant Access"}
          </button>
        </div>
      </Ticket>

      <Ticket icon={Users} title={`Team (${users.length})`}>
        {users.length === 0 ? (
          <p style={{ color: "#857c6c", fontSize: 13 }}>No teammates provisioned yet.</p>
        ) : (
          <table className="list-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontFamily: "Space Grotesk" }}>{u.name}</td>
                  <td style={{ fontFamily: "Space Grotesk" }}>{u.email}</td>
                  <td><span className="badge invoiced">{u.role}</span></td>
                  <td>{u.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Ticket>
    </div>
  );
}
