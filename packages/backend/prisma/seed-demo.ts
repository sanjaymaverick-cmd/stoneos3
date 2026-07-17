// Demo dataset for the isolated demo environment.
//
// Populates a single seeded factory (DEMO_FACTORY_ID) with representative
// Vedam Granites data so every page has something real to show: dashboard
// widgets, production/cutting sessions, polishing, sales orders, expenses,
// and recovery-ratio traces (raw block -> slab -> sold line item).
//
// Safe to re-run: it wipes and re-inserts only this one demo factory's rows,
// never touching any other factory. It does NOT create Clerk users — demo
// mode bypasses Clerk entirely (see src/common/demo.ts).
//
//   DATABASE_URL="postgres://…/stoneos_demo" npx ts-node prisma/seed-demo.ts
//
// Run AFTER `prisma migrate deploy` against the demo database.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Keep in sync with src/common/demo.ts (DEMO_FACTORY_ID).
const FACTORY_ID = process.env.DEMO_FACTORY_ID ?? "d3305e05-0000-4000-8000-000000000001";

const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
};
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));

async function wipe() {
  // Delete child rows before parents to satisfy FKs. Everything is scoped to
  // the demo factory (directly, or through a parent that is).
  await prisma.polishingSessionSlab.deleteMany({ where: { session: { factoryId: FACTORY_ID } } });
  await prisma.polishingSession.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.salesLineItem.deleteMany({ where: { salesOrder: { factoryId: FACTORY_ID } } });
  await prisma.salesOrder.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.dailySalesSummary.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.expense.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.cuttingDayLog.deleteMany({ where: { session: { factoryId: FACTORY_ID } } });
  await prisma.slab.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.cuttingSession.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.rawBlock.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.vehicle.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.customer.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.supplier.deleteMany({ where: { factoryId: FACTORY_ID } });
  await prisma.machine.deleteMany({ where: { factoryId: FACTORY_ID } });
}

async function main() {
  await wipe();

  await prisma.factory.upsert({
    where: { id: FACTORY_ID },
    update: { name: "Vedam Granites" },
    create: { id: FACTORY_ID, name: "Vedam Granites", location: "Ongole, Andhra Pradesh" },
  });

  // Machines
  const b21 = await prisma.machine.create({
    data: { factoryId: FACTORY_ID, name: "B-21", machineType: "cutting", bladeCount: 21 },
  });
  const lpm = await prisma.machine.create({
    data: { factoryId: FACTORY_ID, name: "LPM", machineType: "polishing", headCount: 16, abrasivesPerHead: 6 },
  });

  // Supplier + customers + vehicles
  const supplier = await prisma.supplier.create({
    data: { factoryId: FACTORY_ID, name: "Chimakurthy Quarry Co." },
  });
  const customerNames = ["Sri Balaji Granites", "Pearl Exports", "Deccan Marbles", "Anand Traders", "Kaveri Stone Depot"];
  const customers: Record<string, string> = {};
  for (const name of customerNames) {
    const c = await prisma.customer.create({ data: { factoryId: FACTORY_ID, name } });
    customers[name] = c.id;
  }
  const jcb = await prisma.vehicle.create({ data: { factoryId: FACTORY_ID, name: "JCB", vehicleType: "loader" } });
  await prisma.vehicle.create({ data: { factoryId: FACTORY_ID, name: "Tipper AP-27", vehicleType: "truck" } });

  // Raw blocks across statuses. `active`/`completed` cutting for two of them.
  const blockDefs = [
    { serial: "V-101", variety: "Black Galaxy", tons: 24.5, status: "cutting" },
    { serial: "V-104", variety: "Black Galaxy", tons: 26.0, status: "cutting" },
    { serial: "V-102", variety: "Steel Grey", tons: 19.8, status: "in_stock" },
    { serial: "V-105", variety: "Viscount White", tons: 18.4, status: "in_stock" },
    { serial: "V-106", variety: "Kashmir White", tons: 20.2, status: "in_stock" },
    { serial: "V-107", variety: "Tan Brown", tons: 22.1, status: "in_stock" },
    { serial: "V-108", variety: "Black Galaxy", tons: 25.3, status: "in_stock" },
    { serial: "V-109", variety: "Steel Grey", tons: 19.3, status: "in_stock" },
    { serial: "V-110", variety: "Black Galaxy", tons: 22.6, status: "in_stock" },
    { serial: "V-111", variety: "Viscount White", tons: 18.4, status: "in_stock" },
    { serial: "V-112", variety: "Absolute Black", tons: 23.9, status: "in_stock" },
    { serial: "V-103", variety: "Tan Brown", tons: 22.1, status: "cut" },
    { serial: "V-098", variety: "Steel Grey", tons: 19.8, status: "cut" },
    { serial: "V-100", variety: "Kashmir White", tons: 20.6, status: "cut" },
    { serial: "V-099", variety: "Viscount White", tons: 18.9, status: "cut" },
    // exhausted blocks with full sale traces → recovery ratio
    { serial: "V-097", variety: "Absolute Black", tons: 23.7, status: "exhausted", soldSqft: 2938 },
    { serial: "V-090", variety: "Black Galaxy", tons: 25.1, status: "exhausted", soldSqft: 2962 },
    { serial: "V-085", variety: "Tan Brown", tons: 22.1, status: "exhausted", soldSqft: 2409 },
    { serial: "V-088", variety: "Steel Grey", tons: 19.8, status: "exhausted", soldSqft: 1901 },
    { serial: "V-082", variety: "Viscount White", tons: 18.4, status: "exhausted", soldSqft: 1619 },
    { serial: "V-097b", variety: "Absolute Black", tons: 21.0, status: "exhausted", soldSqft: 2520 },
  ];
  const blocks: Record<string, string> = {};
  for (let i = 0; i < blockDefs.length; i++) {
    const b = blockDefs[i];
    const row = await prisma.rawBlock.create({
      data: {
        factoryId: FACTORY_ID,
        serialNumber: b.serial,
        varietyName: b.variety,
        supplierId: supplier.id,
        weightTons: b.tons,
        purchaseDate: dateOnly(daysAgo(60 - i)),
        invoicedAmount: Math.round(b.tons * 18000),
        currentStatus: b.status,
      },
    });
    blocks[b.serial] = row.id;
  }

  // Active cutting sessions (on the machines right now)
  await prisma.cuttingSession.create({
    data: { factoryId: FACTORY_ID, rawBlockId: blocks["V-101"], machineId: b21.id, startedAt: daysAgo(3), status: "in_progress" },
  });
  await prisma.cuttingSession.create({
    data: { factoryId: FACTORY_ID, rawBlockId: blocks["V-104"], machineId: b21.id, startedAt: daysAgo(0), status: "in_progress" },
  });

  // Completed cutting sessions with slabs (drives Production + recovery)
  const completed = [
    { block: "V-103", variety: "Tan Brown", started: 9, cut: 52, good: 48 },
    { block: "V-098", variety: "Steel Grey", started: 14, cut: 46, good: 43 },
    { block: "V-097", variety: "Absolute Black", started: 20, cut: 58, good: 55 },
  ];
  const polishBatches: { sessionSlabs: string[]; stage: string; finish: string | null; opDay: number }[] = [];
  for (const c of completed) {
    const session = await prisma.cuttingSession.create({
      data: {
        factoryId: FACTORY_ID,
        rawBlockId: blocks[c.block],
        machineId: b21.id,
        startedAt: daysAgo(c.started),
        endedAt: daysAgo(c.started - 3),
        status: "completed",
        totalSlabsCut: c.cut,
        finalGoodSlabCount: c.good,
        damagedSlabCount: c.cut - c.good,
      },
    });
    for (let d = 0; d < 3; d++) {
      await prisma.cuttingDayLog.create({
        data: {
          cuttingSessionId: session.id,
          operationalDate: dateOnly(daysAgo(c.started - d)),
          runtimeHours: 20 + (d % 2),
          slabsProducedCount: Math.round(c.good / 3),
        },
      });
    }
    // register the good slabs
    const slabIds: string[] = [];
    for (let s = 1; s <= c.good; s++) {
      const serial = `${c.block}/${c.cut}/${String(s).padStart(2, "0")}`;
      const slab = await prisma.slab.create({
        data: {
          factoryId: FACTORY_ID,
          parentBlockId: blocks[c.block],
          cuttingSessionId: session.id,
          slabSerial: serial,
          varietyName: c.variety,
          thicknessMm: 18.0,
          lengthFt: 9.0,
          widthFt: 5.5,
          salesStatus: "polished",
        },
      });
      slabIds.push(slab.id);
    }
    polishBatches.push({
      sessionSlabs: slabIds,
      stage: c.block === "V-098" ? "grinding" : "polishing",
      finish: c.block === "V-098" ? null : c.block === "V-097" ? "leather" : "glossy",
      opDay: c.started - 4,
    });
  }

  // Polishing sessions over those slabs
  for (const p of polishBatches) {
    const ps = await prisma.polishingSession.create({
      data: {
        factoryId: FACTORY_ID,
        machineId: lpm.id,
        operationalDate: dateOnly(daysAgo(Math.max(1, p.opDay))),
        stage: p.stage,
        finishType: p.finish ?? undefined,
        slabsPolishedCount: p.sessionSlabs.length,
      },
    });
    for (const slabId of p.sessionSlabs.slice(0, 8)) {
      await prisma.polishingSessionSlab.create({ data: { polishingSessionId: ps.id, slabId } });
    }
  }

  // Sales orders (last 30 days) with line items
  const orders = [
    { cust: "Sri Balaji Granites", variety: "Black Galaxy", day: 1, sqft: 620, rate: 826, type: "invoiced" as const, received: 512000 },
    { cust: "Pearl Exports", variety: "Absolute Black", day: 2, sqft: 1180, rate: 1100, type: "invoiced" as const, received: 900000 },
    { cust: "Deccan Marbles", variety: "Steel Grey", day: 3, sqft: 340, rate: 788, type: "cash" as const, received: 268000 },
    { cust: "Anand Traders", variety: "Tan Brown", day: 5, sqft: 505, rate: 796, type: "invoiced" as const, received: 402000 },
    { cust: "Kaveri Stone Depot", variety: "Viscount White", day: 6, sqft: 890, rate: 829, type: "cash" as const, received: 738000 },
    { cust: "Pearl Exports", variety: "Black Galaxy", day: 8, sqft: 1310, rate: 845, type: "invoiced" as const, received: 1106950 },
  ];
  for (const o of orders) {
    const invoiced = Math.round(o.sqft * o.rate);
    await prisma.salesOrder.create({
      data: {
        factoryId: FACTORY_ID,
        customerId: customers[o.cust],
        orderDate: dateOnly(daysAgo(o.day)),
        lineItems: {
          create: [
            {
              varietyName: o.variety,
              quantity: o.sqft,
              unitPrice: o.rate,
              paymentType: o.type,
              invoicedAmount: invoiced,
              actualAmountReceived: o.received,
            },
          ],
        },
      },
    });
  }

  // Daily sales summary rows (backfill) across the trailing 30 days — drives
  // the dashboard's "Sales — Trailing 30 Days" totals.
  let sTotQty = 0, sTotInv = 0, sTotRec = 0;
  for (let d = 1; d <= 30; d++) {
    if (d % 3 === 0) continue; // some days have no sales
    const qty = 300 + ((d * 37) % 600);
    const invoiced = Math.round(qty * 800);
    const received = Math.round(invoiced * 0.82);
    sTotQty += qty; sTotInv += invoiced; sTotRec += received;
    await prisma.dailySalesSummary.create({
      data: {
        factoryId: FACTORY_ID,
        summaryDate: dateOnly(daysAgo(d)),
        totalQtySqft: qty,
        invoicedAmount: invoiced,
        actualAmountReceived: received,
        isDerived: false,
      },
    });
  }

  // Expenses across real categories over the trailing 30 days
  const expenseRows = [
    { cat: "royalty", day: 1, amount: 210000, to: "Dept. of Mines" },
    { cat: "consumables_epoxy_battery", day: 2, amount: 96000, to: "Sakthi Abrasives" },
    { cat: "staff_salary", day: 3, amount: 320000, to: "Factory payroll" },
    { cat: "vehicle", day: 4, amount: 92000, to: "JCB · diesel", vehicleId: jcb.id },
    { cat: "block_purchase_transport", day: 5, amount: 415000, to: "Sri Lakshmi Lorry" },
    { cat: "block_rent", day: 7, amount: 175000, to: "Quarry lease" },
    { cat: "maintenance", day: 9, amount: 64000, to: "B-21 blade service" },
    { cat: "royalty", day: 12, amount: 260000, to: "Dept. of Mines" },
    { cat: "block_purchase_transport", day: 14, amount: 505000, to: "Sri Lakshmi Lorry" },
    { cat: "staff_salary", day: 18, amount: 320000, to: "Factory payroll" },
    { cat: "consumables_epoxy_battery", day: 20, amount: 138000, to: "Sakthi Abrasives" },
    { cat: "royalty", day: 22, amount: 250000, to: "Dept. of Mines" },
    { cat: "vehicle", day: 24, amount: 71000, to: "Tipper · diesel" },
    { cat: "block_rent", day: 27, amount: 175000, to: "Quarry lease" },
    { cat: "misc", day: 29, amount: 42000, to: "Sundry" },
  ];
  for (const e of expenseRows) {
    await prisma.expense.create({
      data: {
        factoryId: FACTORY_ID,
        category: e.cat,
        amount: e.amount,
        expenseDate: dateOnly(daysAgo(e.day)),
        toWhom: e.to,
        vehicleId: e.vehicleId,
      },
    });
  }

  // Recovery-ratio traces: for each exhausted block, one slab carrying the
  // sold sqft as a sales line item, so GET /raw-blocks/recovery-ratio has
  // real sale-time sqft per ton to compute against the 105 benchmark.
  const anyCustomer = customers["Pearl Exports"];
  const recoveryBlocks = blockDefs.filter((b) => b.soldSqft);
  for (const b of recoveryBlocks) {
    const slab = await prisma.slab.create({
      data: {
        factoryId: FACTORY_ID,
        parentBlockId: blocks[b.serial],
        slabSerial: `${b.serial}/SOLD/01`,
        varietyName: b.variety,
        salesStatus: "sold",
        isBackfilled: true,
      },
    });
    const order = await prisma.salesOrder.create({
      data: { factoryId: FACTORY_ID, customerId: anyCustomer, orderDate: dateOnly(daysAgo(40)) },
    });
    await prisma.salesLineItem.create({
      data: {
        salesOrderId: order.id,
        slabId: slab.id,
        varietyName: b.variety,
        quantity: b.soldSqft!,
        unitPrice: 850,
        paymentType: "invoiced",
        invoicedAmount: Math.round(b.soldSqft! * 850),
        actualAmountReceived: Math.round(b.soldSqft! * 850),
      },
    });
  }

  console.log(`Demo factory seeded: ${FACTORY_ID}`);
  console.log(`  ${blockDefs.length} raw blocks, ${completed.length} completed + 2 active cutting sessions`);
  console.log(`  ${orders.length} sales orders, ${expenseRows.length} expenses, 30d sales summary`);
  console.log(`  Trailing-30d sales: ${sTotQty} sqft, invoiced ₹${sTotInv.toLocaleString("en-IN")}, received ₹${sTotRec.toLocaleString("en-IN")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
