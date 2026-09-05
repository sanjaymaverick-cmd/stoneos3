"use client";

import { useState } from "react";
import { useAuth, useUser } from "../../lib/session";
import { MessageCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch, safeGetToken } from "../../lib/api";
import { AppNav } from "../../components/AppNav";
import { Ticket } from "../../components/Ticket";
import { useRole } from "../../lib/useRole";

interface ChatEntry {
  question: string;
  answer: string;
  sql: string | null;
  showSql: boolean;
  isError?: boolean;
}

export default function CopilotPage() {
  const { isLoaded } = useUser();
  const role = useRole();

  if (!isLoaded) return <Shell><p className="loading-note">Loading…</p></Shell>;

  // Owner only — narrower than the dashboard's "owner or admin" gate. This
  // was the Owner's own explicit choice for this feature, not an oversight.
  if (role !== "owner") {
    return (
      <Shell>
        <p style={{ margin: 0 }}>This page is only visible to the owner.</p>
      </Shell>
    );
  }

  return <CopilotChat />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <h1 className="stamp-title">AI COPILOT</h1>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>
      <div className="ticket">
        <div className="ticket-notch left" /><div className="ticket-notch right" />
        {children}
      </div>
    </div>
  );
}

function CopilotChat() {
  const { getToken } = useAuth();
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [asking, setAsking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setPendingQuestion(q);
    setQuestion("");
    try {
      const token = await safeGetToken(getToken);
      if (!token) return;
      const res = await apiFetch("/copilot/ask", token, {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setEntries((prev) => [...prev, { question: q, answer: res.answer, sql: res.sql, showSql: false }]);
    } catch (e: any) {
      setEntries((prev) => [
        ...prev,
        { question: q, answer: e.message ?? "Something went wrong asking the Copilot.", sql: null, showSql: false, isError: true },
      ]);
    } finally {
      setAsking(false);
      setPendingQuestion("");
    }
  };

  const toggleSql = (index: number) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, showSql: !e.showSql } : e)));
  };

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <h1 className="stamp-title">AI COPILOT</h1>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      <Ticket
        icon={MessageCircle}
        title="Ask a Business Question"
        subtitle="Free-form questions about production, sales, expenses, and inventory — answered from your factory's own data only"
        accent="brass"
      >
        {entries.length === 0 && !asking ? (
          <p className="empty-note">
            Try something like "how much did we spend on diesel last month?" or "what's our current raw block stock by variety?"
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
            {entries.map((entry, i) => (
              <div key={i} style={{ borderBottom: "1px dashed var(--stone-400)", paddingBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{entry.question}</div>
                <p style={{ margin: 0, fontSize: 13.5, color: entry.isError ? "var(--rust)" : "var(--ink)" }}>{entry.answer}</p>
                {entry.sql && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={() => toggleSql(i)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11.5,
                        color: "#6B6255",
                        fontFamily: "Space Grotesk",
                      }}
                    >
                      {entry.showSql ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {entry.showSql ? "Hide query" : "Show query"}
                    </button>
                    {entry.showSql && (
                      <pre
                        className="mono"
                        style={{
                          marginTop: 6,
                          padding: 10,
                          background: "var(--stone-100)",
                          border: "1px solid var(--stone-400)",
                          borderRadius: 4,
                          fontSize: 11.5,
                          overflowX: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {entry.sql}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
            {asking && (
              <div style={{ borderBottom: "1px dashed var(--stone-400)", paddingBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{pendingQuestion}</div>
                <p className="loading-note">Thinking… this can take a few seconds.</p>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="field-input"
            style={{ flex: 1 }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask a question about your factory's data…"
            disabled={asking}
          />
          <button className="primary-btn" onClick={ask} disabled={asking || !question.trim()}>
            <Send size={15} />
            {asking ? "Asking…" : "Ask"}
          </button>
        </div>
      </Ticket>
    </div>
  );
}
