"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { TrendingUp, Wallet, Factory, Boxes, Activity } from "lucide-react";
import { apiFetch, safeGetToken } from "../../lib/api";
import { AppNav } from "../../components/AppNav";
import { Ticket } from "../../components/Ticket";
import { useRole } from "../../lib/useRole";

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const isoToday = () => new Date().toISOString().slice(0, 10);

interface SalesSummary { qty: number; invoiced: number; received: number }
interface CategoryTotal { category: string; amount: number }
interface ExpenseSummary { total: number; byCategory: CategoryTotal[] }
interface StatusCount { status: string; count: number }

export default function Dashboard() {
  const { isLoaded } = useUser();
  const role = useRole();
  if (!isLoaded) return <LoadingDashboard />;
  return role === "owner" || role === "admin" ? <OwnerDashboard /> : <PlaceholderDashboard />;
}

// Distinct from PlaceholderDashboard — that's "this isn't your dashboard",
// this is "we don't know your role yet". Conflating the two meant an
// owner/admin briefly saw the non-owner placeholder flash before Clerk
// resolved (Richard's Should Fix, Step 4 review).
function LoadingDashboard() {
  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <div className="stamp-title">DASHBOARD</div>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>
      <div className="ticket"><div className="ticket-notch left" /><div className="ticket-notch right" /><p>Loading…</p></div>
    </div>
  );
}

function PlaceholderDashboard() {
  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <div className="stamp-title">DASHBOARD</div>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>
      <div className="ticket">
        <div className="ticket-notch left" /><div className="ticket-notch right" />
        <p>Dashboard shell — production, sales, and expenses summaries land here next.</p>
      </div>
    </div>
  );
}

function OwnerDashboard() {
  const { getToken } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sales, setSales] = useState<SalesSummary>({ qty: 0, invoiced: 0, received: 0 });
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary>({ total: 0, byCategory: [] });
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [blockStock, setBlockStock] = useState<StatusCount[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);

  const load = async () => {
    try {
      const token = await safeGetToken(getToken);
      if (!token) return;

      const from = isoDaysAgo(30);
      const to = isoToday();

      const [salesRows, expenseRows30, sessions, blocks, orders, allExpenses] = await Promise.all([
        apiFetch(`/daily-sales-summary?from=${from}&to=${to}`, token),
        apiFetch(`/expenses?from=${from}&to=${to}`, token),
        apiFetch("/cutting-sessions/active", token),
        apiFetch("/raw-blocks", token),
        apiFetch("/sales-orders", token),
        apiFetch("/expenses", token),
      ]);

      setSales(
        salesRows.reduce(
          (acc: SalesSummary, r: any) => ({
            qty: acc.qty + Number(r.totalQtySqft ?? 0),
            invoiced: acc.invoiced + Number(r.invoicedAmount ?? 0),
            received: acc.received + Number(r.actualAmountReceived ?? 0),
          }),
          { qty: 0, invoiced: 0, received: 0 },
        ),
      );

      const catTotals = new Map<string, number>();
      let expenseTotal = 0;
      for (const e of expenseRows30) {
        const amt = Number(e.amount);
        expenseTotal += amt;
        catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + amt);
      }
      const byCategory = Array.from(catTotals, ([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      setExpenseSummary({ total: expenseTotal, byCategory });

      setActiveSessions(sessions);

      const statusCounts = new Map<string, number>();
      for (const b of blocks) statusCounts.set(b.currentStatus, (statusCounts.get(b.currentStatus) ?? 0) + 1);
      setBlockStock(Array.from(statusCounts, ([status, count]) => ({ status, count })));

      setRecentOrders(
        [...orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5),
      );
      setRecentExpenses(
        [...allExpenses].sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()).slice(0, 5),
      );
      setErrorMsg("");
    } catch (e: any) {
      // A transient failure on any one of the 5 calls used to leave `loaded`
      // false forever (permanent "Loading…", no explanation) — surface it
      // instead, matching admin/users/page.tsx's loadUsers pattern.
      setErrorMsg(e.message ?? "Failed to load dashboard data");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);

  const maxCategoryAmount = Math.max(1, ...expenseSummary.byCategory.map((c) => c.amount));

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <div className="stamp-title">DASHBOARD</div>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      {!loaded ? (
        <div className="ticket"><div className="ticket-notch left" /><div className="ticket-notch right" /><p>Loading…</p></div>
      ) : errorMsg ? (
        <div className="ticket">
          <div className="ticket-notch left" /><div className="ticket-notch right" />
          <p style={{ color: "var(--rust)", margin: 0 }}>Couldn't load dashboard data: {errorMsg}</p>
        </div>
      ) : (
        <div className="dashboard-fade-in">
          <Ticket icon={TrendingUp} title="Sales — Trailing 30 Days" subtitle="Quantity, invoiced value, and cash actually received" accent="moss">
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-number">{fmt(sales.qty)}</div>
                <div className="stat-label">Sqft Sold</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">₹{fmt(sales.invoiced)}</div>
                <div className="stat-label">Invoiced</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">₹{fmt(sales.received)}</div>
                <div className="stat-label">Actually Received</div>
              </div>
            </div>
          </Ticket>

          <Ticket icon={Wallet} title="Expenses — Trailing 30 Days" subtitle="Total spend and top categories" accent="rust">
            <div className="stat-row" style={{ marginBottom: expenseSummary.byCategory.length ? 14 : 0 }}>
              <div className="stat-card">
                <div className="stat-number">₹{fmt(expenseSummary.total)}</div>
                <div className="stat-label">Total Spend</div>
              </div>
            </div>
            {expenseSummary.byCategory.length > 0 && (
              <div className="mini-bar-list">
                {expenseSummary.byCategory.map((c) => (
                  <div className="mini-bar-row" key={c.category}>
                    <span className="mini-bar-label">{c.category.replaceAll("_", " ")}</span>
                    <div className="mini-bar-track">
                      <div className="mini-bar-fill" style={{ width: `${(c.amount / maxCategoryAmount) * 100}%` }} />
                    </div>
                    <span className="mini-bar-value mono">₹{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Ticket>

          <Ticket icon={Factory} title="On the Machines Right Now" subtitle="Active cutting sessions" accent="brass">
            {activeSessions.length === 0 ? (
              <p className="empty-note">Nothing is currently under cutting.</p>
            ) : (
              <div className="session-grid">
                {activeSessions.map((s) => {
                  const days = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 86400000);
                  return (
                    <div className="session-card" key={s.id}>
                      <div className="session-serial mono">{s.rawBlock?.serialNumber ?? "—"}</div>
                      <div className="session-variety">{s.rawBlock?.varietyName ?? "—"}</div>
                      <div className="session-days">{days <= 0 ? "Started today" : `${days} day${days === 1 ? "" : "s"} running`}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Ticket>

          <Ticket icon={Boxes} title="Raw Block Stock" subtitle="Grouped by current status" accent="moss">
            {blockStock.length === 0 ? (
              <p className="empty-note">No raw blocks recorded yet.</p>
            ) : (
              <div className="stat-row">
                {blockStock.map((s) => (
                  <div className="stat-card" key={s.status}>
                    <div className="stat-number">{s.count}</div>
                    <div className="stat-label">{s.status.replaceAll("_", " ")}</div>
                  </div>
                ))}
              </div>
            )}
          </Ticket>

          <Ticket icon={Activity} title="Recent Activity" subtitle="Latest 5 sales orders and expenses" accent="rust">
            <div className="recent-columns">
              <div>
                <div className="recent-col-title">Sales Orders</div>
                {recentOrders.length === 0 ? (
                  <p className="empty-note">No sales orders yet.</p>
                ) : (
                  <table className="list-table">
                    <thead><tr><th>Date</th><th>Customer</th></tr></thead>
                    <tbody>
                      {recentOrders.map((o) => (
                        <tr key={o.id}>
                          <td>{new Date(o.orderDate).toLocaleDateString("en-IN")}</td>
                          <td style={{ fontFamily: "Space Grotesk" }}>{o.customer?.name ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div className="recent-col-title">Expenses</div>
                {recentExpenses.length === 0 ? (
                  <p className="empty-note">No expenses yet.</p>
                ) : (
                  <table className="list-table">
                    <thead><tr><th>Date</th><th>Category</th><th>Amount</th></tr></thead>
                    <tbody>
                      {recentExpenses.map((e) => (
                        <tr key={e.id}>
                          <td>{new Date(e.expenseDate).toLocaleDateString("en-IN")}</td>
                          <td style={{ fontFamily: "Space Grotesk" }}>{e.category.replaceAll("_", " ")}</td>
                          <td>₹{fmt(Number(e.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Ticket>
        </div>
      )}
    </div>
  );
}
