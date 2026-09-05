"use client";

import { useState, useEffect } from "react";
import { useAuth, useUser } from "../../../lib/session";
import { Users, UserPlus, Save, Check, KeyRound, Ban, RotateCcw } from "lucide-react";
import { apiFetch, safeGetToken } from "../../../lib/api";
import { AppNav } from "../../../components/AppNav";
import { Ticket } from "../../../components/Ticket";

// Matches app_user.role check constraint in the schema — keep in sync.
const ROLES = ["owner", "manager", "supervisor", "operator", "accountant", "auditor", "admin"];

interface TeamMember {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
}

export default function AdminUsersPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const myRole = user?.role;
  const canAdminister = myRole === "owner" || myRole === "admin";

  const [users, setUsers] = useState<TeamMember[]>([]);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("supervisor");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  // The one-time password from the last issue/reset. Held only in component
  // state — it is never fetched again, because the server keeps only its hash.
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    try {
      setUsers(await apiFetch("/admin/users", token));
      setLoadError("");
    } catch (e: any) {
      // A non-admin hitting this is expected (403) — the page already
      // hides the UI for them via `canAdminister`, so don't surface that
      // one as an error. Anything else (500, network drop) IS a real
      // failure and should say so, not look identical to "no teammates".
      if (!e.message?.includes("403")) setLoadError(e.message ?? "Failed to load team list");
    }
    setLoaded(true);
  };

  useEffect(() => {
    if (canAdminister) loadUsers();
    else setLoaded(true);
  }, [canAdminister]);

  const provision = async () => {
    if (!username.trim()) {
      setErrorMsg("Choose a username for them — this is what they will sign in with");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setErrorMsg("");
    try {
      const token = await safeGetToken(getToken);
      if (!token) throw new Error("not authenticated");
      const result = await apiFetch("/admin/users", token, {
        method: "POST",
        body: JSON.stringify({ username: username.trim().toLowerCase(), name: name.trim() || undefined, role }),
      });
      // Only a newly created account comes back with a password; a role
      // change on an existing one deliberately leaves credentials alone.
      if (result.password) setIssued({ username: result.user.username, password: result.password });
      setUsername("");
      setName("");
      await loadUsers();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1800);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to issue access");
      setStatus("error");
    }
  };

  // revoke / reinstate / reset-password all follow the same shape.
  const act = async (id: string, action: "revoke" | "reinstate" | "reset-password", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    setErrorMsg("");
    try {
      const token = await safeGetToken(getToken);
      if (!token) throw new Error("not authenticated");
      const result = await apiFetch(`/admin/users/${id}/${action}`, token, { method: "POST" });
      if (result.password) setIssued({ username: result.user.username, password: result.password });
      await loadUsers();
    } catch (e: any) {
      setErrorMsg(e.message ?? `Failed to ${action}`);
    }
    setBusyId(null);
  };

  if (!loaded) {
    return (
      <div className="app-shell">
        <div className="stamp">
          <div><h1 className="stamp-title">TEAM ACCESS</h1></div>
          <AppNav />
        </div>
        <div className="ticket"><div className="ticket-notch left" /><div className="ticket-notch right" /><p className="loading-note">Loading…</p></div>
      </div>
    );
  }

  if (!canAdminister) {
    return (
      <div className="app-shell">
        <div className="stamp">
          <div><h1 className="stamp-title">TEAM ACCESS</h1></div>
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
          <h1 className="stamp-title">TEAM ACCESS</h1>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      {issued && (
        <Ticket icon={KeyRound} title="Password issued" subtitle="Shown once — copy it now" accent="rust">
          <p style={{ marginTop: 0, fontSize: 13 }}>
            Give these to <strong>{issued.username}</strong>. This password is not stored anywhere you can read it
            again — if it is lost, issue a reset.
          </p>
          <div
            style={{
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 16,
              padding: "12px 14px",
              background: "var(--paper-shade, #F1EDE4)",
              borderRadius: 6,
              userSelect: "all",
              wordBreak: "break-all",
            }}
          >
            {issued.username} / {issued.password}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              className="primary-btn"
              onClick={() => navigator.clipboard?.writeText(`${issued.username} / ${issued.password}`)}
            >
              Copy
            </button>
            <button className="ghost-btn" onClick={() => setIssued(null)}>
              Done
            </button>
          </div>
        </Ticket>
      )}

      <Ticket
        icon={UserPlus}
        title="Issue Access"
        subtitle="Creates the login and generates their password — there is no sign-up"
        accent="moss"
      >
        <div className="grid">
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ramesh.k"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span className="field-label">Full Name</span>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramesh Kumar" />
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
            {status === "saving" ? "Issuing…" : status === "saved" ? "Issued" : "Issue Access"}
          </button>
        </div>
      </Ticket>

      <Ticket icon={Users} title={`Team (${users.length})`}>
        {loadError ? (
          <p style={{ color: "var(--rust)", fontSize: 13 }}>Couldn&apos;t load the team list: {loadError}</p>
        ) : users.length === 0 ? (
          <p className="empty-note">Nobody has been issued access yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="list-table">
              <thead>
                <tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === user?.id;
                  return (
                    <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                      <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{u.username}</td>
                      <td style={{ fontFamily: "Space Grotesk" }}>{u.name}</td>
                      <td><span className="badge invoiced">{u.role}</span></td>
                      <td>{u.active ? "Active" : "Revoked"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {/* Self-revocation is refused by the backend too — hiding
                            it here just avoids offering a button that cannot work. */}
                        {u.active ? (
                          <button
                            className="ghost-btn"
                            disabled={isMe || busyId === u.id}
                            title={isMe ? "You cannot revoke your own access" : "Revoke access immediately"}
                            onClick={() =>
                              act(u.id, "revoke", `Revoke access for ${u.username}? They are signed out immediately.`)
                            }
                          >
                            <Ban size={13} /> Revoke
                          </button>
                        ) : (
                          <button
                            className="ghost-btn"
                            disabled={busyId === u.id}
                            title="Restore access with a new password"
                            onClick={() => act(u.id, "reinstate")}
                          >
                            <RotateCcw size={13} /> Reinstate
                          </button>
                        )}
                        <button
                          className="ghost-btn"
                          disabled={busyId === u.id}
                          title="Issue a new password"
                          onClick={() =>
                            act(u.id, "reset-password", `Reset the password for ${u.username}? Their current one stops working.`)
                          }
                        >
                          <KeyRound size={13} /> Reset
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Ticket>
    </div>
  );
}
