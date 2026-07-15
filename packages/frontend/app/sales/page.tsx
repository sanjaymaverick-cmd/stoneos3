"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { ClipboardList, Plus, Trash2, Save, Check } from "lucide-react";
import { apiFetch, safeGetToken } from "../../lib/api";
import { AppNav } from "../../components/AppNav";

interface LineItem {
  id: string;
  slabId: string;
  varietyName: string;
  quantity: string;
  unitPrice: string;
  gstAmount: string;
  loadingCharge: string;
  transportCharge: string;
  invoicedAmount: string;
  actualAmountReceived: string;
  paymentType: "invoiced" | "cash" | "mixed";
}

const num = (v: string) => (v === "" ? 0 : parseFloat(v) || 0);
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const newLine = (): LineItem => ({
  id: crypto.randomUUID(), slabId: "", varietyName: "", quantity: "", unitPrice: "",
  gstAmount: "", loadingCharge: "", transportCharge: "", invoicedAmount: "",
  actualAmountReceived: "", paymentType: "invoiced",
});

export default function SalesPage() {
  const { getToken } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [orders, setOrders] = useState<any[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [customerErrorMsg, setCustomerErrorMsg] = useState("");

  const loadCustomers = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    setCustomers(await apiFetch("/customers", token));
  };
  const loadOrders = async () => {
    const token = await safeGetToken(getToken);
    if (!token) return;
    setOrders(await apiFetch("/sales-orders", token));
  };

  useEffect(() => { loadCustomers(); loadOrders(); }, []);

  const addCustomer = async () => {
    if (!newCustomerName.trim() || addingCustomer) return;
    setAddingCustomer(true);
    setCustomerErrorMsg("");
    try {
      const token = await safeGetToken(getToken);
      if (!token) return;
      const created = await apiFetch("/customers", token, { method: "POST", body: JSON.stringify({ name: newCustomerName }) });
      setNewCustomerName("");
      await loadCustomers();
      setCustomerId(created.id);
    } catch (e: any) {
      setCustomerErrorMsg(e.message ?? "Failed to add customer");
    } finally {
      setAddingCustomer(false);
    }
  };

  const updateLine = (id: string, field: keyof LineItem, value: string) =>
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const lineTotal = (l: LineItem) => num(l.quantity) * num(l.unitPrice) + num(l.gstAmount) + num(l.loadingCharge) + num(l.transportCharge);
  const orderTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  const submitOrder = async () => {
    if (!customerId) { setErrorMsg("Pick or add a customer first"); setStatus("error"); return; }
    setStatus("saving");
    setErrorMsg("");
    try {
      const token = await getToken();
      if (!token) throw new Error("not authenticated");
      await apiFetch("/sales-orders", token, {
        method: "POST",
        body: JSON.stringify({
          customerId,
          orderDate,
          lineItems: lines.map((l) => ({
            slabId: l.slabId || undefined,
            varietyName: l.varietyName,
            quantity: num(l.quantity),
            unitPrice: num(l.unitPrice),
            gstAmount: num(l.gstAmount),
            loadingCharge: num(l.loadingCharge),
            transportCharge: num(l.transportCharge),
            invoicedAmount: l.invoicedAmount ? num(l.invoicedAmount) : undefined,
            actualAmountReceived: l.actualAmountReceived ? num(l.actualAmountReceived) : undefined,
            paymentType: l.paymentType,
          })),
        }),
      });
      setStatus("saved");
      setLines([newLine()]);
      await loadOrders();
      setTimeout(() => setStatus("idle"), 1800);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to save order");
      setStatus("error");
    }
  };

  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <h1 className="stamp-title">SALES</h1>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>

      <div className="ticket">
        <div className="ticket-notch left" /><div className="ticket-notch right" />
        <div className="ticket-header">
          <div className="ticket-icon moss"><ClipboardList size={16} /></div>
          <div>
            <h2 className="ticket-title">New Sales Order</h2>
            <div className="ticket-subtitle">Structured line items — one row per variety/transaction</div>
          </div>
        </div>

        <div className="grid" style={{ marginBottom: 14 }}>
          <label className="field">
            <span className="field-label">Order Date</span>
            <input className="field-input" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Customer<span className="required-mark">*</span></span>
            <select className="field-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Or Add New Customer</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="field-input" placeholder="Customer name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} disabled={addingCustomer} />
              <button className="add-btn" style={{ width: "auto", padding: "7px 12px" }} onClick={addCustomer} disabled={addingCustomer}>
                {addingCustomer ? "Adding…" : "Add"}
              </button>
            </div>
          </label>
        </div>
        {customerErrorMsg && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: -8, marginBottom: 14 }}>{customerErrorMsg}</div>}
        {errorMsg && <div style={{ color: "var(--rust)", fontSize: 12.5, marginTop: -8, marginBottom: 14 }}>{errorMsg}</div>}

        {lines.map((l) => (
          <div className="row-card" key={l.id}>
            {lines.length > 1 && (
              <button
                className="row-remove"
                aria-label="Remove line item"
                onClick={() => setLines((s) => s.filter((r) => r.id !== l.id))}
              >
                <Trash2 size={14} />
              </button>
            )}
            <div className="row-grid">
              <label className="field"><span className="field-label">Variety</span>
                <input className="field-input" value={l.varietyName} onChange={(e) => updateLine(l.id, "varietyName", e.target.value)} placeholder="Kotra" />
              </label>
              <label className="field"><span className="field-label">Qty (sqft)</span>
                <input className="field-input" value={l.quantity} onChange={(e) => updateLine(l.id, "quantity", e.target.value)} placeholder="0" />
              </label>
              <label className="field"><span className="field-label">Unit Price</span>
                <input className="field-input" value={l.unitPrice} onChange={(e) => updateLine(l.id, "unitPrice", e.target.value)} placeholder="0" />
              </label>
              <label className="field"><span className="field-label">GST</span>
                <input className="field-input" value={l.gstAmount} onChange={(e) => updateLine(l.id, "gstAmount", e.target.value)} placeholder="0" />
              </label>
              <label className="field"><span className="field-label">Loading</span>
                <input className="field-input" value={l.loadingCharge} onChange={(e) => updateLine(l.id, "loadingCharge", e.target.value)} placeholder="0" />
              </label>
              <label className="field"><span className="field-label">Transport</span>
                <input className="field-input" value={l.transportCharge} onChange={(e) => updateLine(l.id, "transportCharge", e.target.value)} placeholder="0" />
              </label>
              <label className="field"><span className="field-label">Payment</span>
                <select className="field-input" value={l.paymentType} onChange={(e) => updateLine(l.id, "paymentType", e.target.value)}>
                  <option value="invoiced">Invoiced</option>
                  <option value="cash">Cash</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              {l.paymentType !== "invoiced" && (
                <>
                  <label className="field"><span className="field-label">Invoiced Amt</span>
                    <input className="field-input" value={l.invoicedAmount} onChange={(e) => updateLine(l.id, "invoicedAmount", e.target.value)} placeholder="0" />
                  </label>
                  <label className="field"><span className="field-label">Actual Received</span>
                    <input className="field-input" value={l.actualAmountReceived} onChange={(e) => updateLine(l.id, "actualAmountReceived", e.target.value)} placeholder="0" />
                  </label>
                </>
              )}
              <label className="field"><span className="field-label">Row Total</span>
                <div className="field-input mono" style={{ background: "#F3F1EA", fontWeight: 600 }}>₹{fmt(lineTotal(l))}</div>
              </label>
            </div>
          </div>
        ))}

        <button className="add-btn" onClick={() => setLines((s) => [...s, newLine()])}>
          <Plus size={14} /> Add line item
        </button>

        <div className="totals-strip">
          <span className="label">Order Total</span>
          <span className="value">₹{fmt(orderTotal)}</span>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button className={`primary-btn ${status === "saved" ? "saved" : ""}`} onClick={submitOrder} disabled={status === "saving"}>
            {status === "saved" ? <Check size={15} /> : <Save size={15} />}
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save Order"}
          </button>
        </div>
      </div>

      <div className="ticket">
        <div className="ticket-notch left" /><div className="ticket-notch right" />
        <div className="ticket-header">
          <div className="ticket-icon brass"><ClipboardList size={16} /></div>
          <div><h2 className="ticket-title">Recent Orders</h2></div>
        </div>
        <div className="table-scroll">
          <table className="list-table">
            <thead><tr><th>Date</th><th>Customer</th><th>Lines</th><th>Payment</th><th>Total</th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const total = (o.lineItems ?? []).reduce((s: number, li: any) =>
                  s + Number(li.quantity) * Number(li.unitPrice) + Number(li.gstAmount ?? 0) + Number(li.loadingCharge ?? 0) + Number(li.transportCharge ?? 0), 0);
                const paymentTypes = Array.from(new Set((o.lineItems ?? []).map((li: any) => li.paymentType)));
                return (
                  <tr key={o.id}>
                    <td>{new Date(o.orderDate).toLocaleDateString("en-IN")}</td>
                    <td style={{ fontFamily: "Space Grotesk" }}>{o.customer?.name}</td>
                    <td>{o.lineItems?.length ?? 0}</td>
                    <td>{paymentTypes.map((t: any) => <span key={t} className={`badge ${t}`} style={{ marginRight: 4 }}>{t}</span>)}</td>
                    <td>₹{fmt(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
