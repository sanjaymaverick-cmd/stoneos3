// Read-only verification for Step 4 (Owner/Admin dashboard). Not committed.
// Browser-based login verification is blocked (Clerk sign-in requires a
// password, which Claude Code's safety rules prohibit entering). This script
// instead runs the exact same queries + client-side aggregation logic the
// dashboard's load() function performs, directly against local Postgres via
// Prisma, against the real backfilled Vedam Granites factory, to confirm the
// widget arithmetic and empty-state handling are correct for real data.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const isoToday = () => new Date().toISOString().slice(0, 10);

async function main() {
  const factory = await prisma.factory.findFirst({ where: { name: "Vedam Granites" } });
  if (!factory) throw new Error("Vedam Granites factory not found — expected from Step 1 backfill");
  const factoryId = factory.id;
  const from = isoDaysAgo(30);
  const to = isoToday();
  console.log(`Factory: ${factory.name} (${factoryId})`);
  console.log(`Range: ${from} .. ${to}\n`);

  // Widget 1 — sales summary, trailing 30 days
  const salesRows = await prisma.dailySalesSummary.findMany({
    where: { factoryId, summaryDate: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { summaryDate: "asc" },
  });
  const sales = salesRows.reduce(
    (acc, r) => ({
      qty: acc.qty + Number(r.totalQtySqft ?? 0),
      invoiced: acc.invoiced + Number(r.invoicedAmount ?? 0),
      received: acc.received + Number(r.actualAmountReceived ?? 0),
    }),
    { qty: 0, invoiced: 0, received: 0 },
  );
  console.log("Widget 1 — Sales summary (30d):", { rows: salesRows.length, ...sales });

  // Widget 2 — expense summary, trailing 30 days
  const expenseRows30 = await prisma.expense.findMany({
    where: { factoryId, expenseDate: { gte: new Date(from), lte: new Date(to) } },
    include: { vehicle: true, allocations: true },
    orderBy: { expenseDate: "desc" },
  });
  const catTotals = new Map();
  let expenseTotal = 0;
  for (const e of expenseRows30) {
    const amt = Number(e.amount);
    expenseTotal += amt;
    catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + amt);
  }
  const byCategory = Array.from(catTotals, ([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  console.log("Widget 2 — Expense summary (30d):", { rows: expenseRows30.length, total: expenseTotal, byCategory });

  // Widget 3 — active cutting sessions
  const sessions = await prisma.cuttingSession.findMany({
    where: { factoryId, status: "in_progress" },
    include: { rawBlock: true, dayLogs: { orderBy: { operationalDate: "asc" } } },
  });
  console.log(
    "Widget 3 — Active sessions:",
    sessions.length === 0
      ? "0 (empty state — correct, matches SESSION-CHECKPOINT: raw_block is empty locally)"
      : sessions.map((s) => ({
          serial: s.rawBlock?.serialNumber,
          variety: s.rawBlock?.varietyName,
          days: Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 86400000),
        })),
  );

  // Widget 4 — raw block stock snapshot
  const blocks = await prisma.rawBlock.findMany({ where: { factoryId }, orderBy: { createdAt: "desc" } });
  const statusCounts = new Map();
  for (const b of blocks) statusCounts.set(b.currentStatus, (statusCounts.get(b.currentStatus) ?? 0) + 1);
  console.log(
    "Widget 4 — Raw block stock:",
    blocks.length === 0 ? "0 (empty state — correct, raw_block table empty locally)" : Array.from(statusCounts, ([status, count]) => ({ status, count })),
  );

  // Widget 5 — recent activity
  const orders = await prisma.salesOrder.findMany({ where: { factoryId }, include: { lineItems: true, customer: true }, orderBy: { orderDate: "desc" } });
  const allExpenses = await prisma.expense.findMany({ where: { factoryId }, include: { vehicle: true, allocations: true }, orderBy: { expenseDate: "desc" } });
  const recentOrders = [...orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5);
  const recentExpenses = [...allExpenses].sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()).slice(0, 5);
  console.log("Widget 5 — Recent sales orders (total in DB:", orders.length, "):", recentOrders.map((o) => ({ date: o.orderDate, customer: o.customer?.name })));
  console.log(
    "Widget 5 — Recent expenses (total in DB:",
    allExpenses.length,
    "):",
    recentExpenses.map((e) => ({ date: e.expenseDate, category: e.category, amount: Number(e.amount) })),
  );
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
