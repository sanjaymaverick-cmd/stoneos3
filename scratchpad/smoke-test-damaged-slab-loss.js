// Throwaway smoke test for Step 3 — damagedSlabLoss on RawBlockService.findOne.
// Not committed. Creates a disposable factory + blocks, exercises the compiled
// service logic via direct Prisma queries mirroring what the service does,
// then cleans up.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`PASS: ${label}`);
  } else {
    fail++;
    console.log(`FAIL: ${label}`);
  }
}

// Mirrors RawBlockService.computeDamagedSlabLoss exactly (copy for isolated testing).
function computeDamagedSlabLoss(block) {
  const costBasis =
    block.actualAmountPaid != null ? "actual_amount_paid" : block.invoicedAmount != null ? "invoiced_amount" : null;
  const totalCost =
    costBasis === "actual_amount_paid"
      ? Number(block.actualAmountPaid)
      : costBasis === "invoiced_amount"
        ? Number(block.invoicedAmount)
        : null;

  const reportedSessions = block.cuttingSessions.filter((s) => s.totalSlabsCut != null);
  const totalSlabsCut = reportedSessions.reduce((sum, s) => sum + (s.totalSlabsCut ?? 0), 0);
  const damagedSlabCount = reportedSessions.reduce((sum, s) => sum + (s.damagedSlabCount ?? 0), 0);

  const costPerSlab = totalCost != null && totalSlabsCut > 0 ? totalCost / totalSlabsCut : null;
  const lossAmount = costPerSlab != null ? costPerSlab * damagedSlabCount : null;

  return { costBasis, totalCost, totalSlabsCut, damagedSlabCount, costPerSlab, lossAmount };
}

async function main() {
  const factory = await prisma.factory.create({
    data: { name: `SMOKE-TEST-FACTORY-S3-${Date.now()}` },
  });
  const machine = await prisma.machine.create({
    data: { factoryId: factory.id, name: "SMOKE-CUT-1", machineType: "cutting" },
  });

  try {
    // Case 1: normal block, cost recorded, some damaged slabs.
    const block1 = await prisma.rawBlock.create({
      data: {
        factoryId: factory.id,
        serialNumber: "S3-1",
        varietyName: "Test Granite",
        entrySource: "purchase",
        costStatus: "confirmed",
        currentStatus: "in_stock",
        actualAmountPaid: 100000,
        invoicedAmount: 95000,
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block1.id,
        machineId: machine.id,
        startedAt: new Date(),
        endedAt: new Date(),
        status: "completed",
        totalSlabsCut: 20,
        finalGoodSlabCount: 17,
        damagedSlabCount: 3,
      },
    });
    const r1 = await prisma.rawBlock.findFirst({
      where: { id: block1.id },
      include: { transitions: true, slabs: true, cuttingSessions: true },
    });
    const loss1 = computeDamagedSlabLoss(r1);
    check("Case1: costBasis = actual_amount_paid (prefers actual over invoiced)", loss1.costBasis === "actual_amount_paid");
    check("Case1: totalCost = 100000", loss1.totalCost === 100000);
    check("Case1: totalSlabsCut = 20", loss1.totalSlabsCut === 20);
    check("Case1: damagedSlabCount = 3", loss1.damagedSlabCount === 3);
    check("Case1: costPerSlab = 5000", loss1.costPerSlab === 5000);
    check("Case1: lossAmount = 15000", loss1.lossAmount === 15000);

    // Case 2: zero damaged slabs.
    const block2 = await prisma.rawBlock.create({
      data: {
        factoryId: factory.id,
        serialNumber: "S3-2",
        varietyName: "Test Granite",
        entrySource: "purchase",
        costStatus: "confirmed",
        currentStatus: "in_stock",
        actualAmountPaid: 50000,
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block2.id,
        machineId: machine.id,
        startedAt: new Date(),
        endedAt: new Date(),
        status: "completed",
        totalSlabsCut: 10,
        finalGoodSlabCount: 10,
        damagedSlabCount: 0,
      },
    });
    const r2 = await prisma.rawBlock.findFirst({
      where: { id: block2.id },
      include: { transitions: true, slabs: true, cuttingSessions: true },
    });
    const loss2 = computeDamagedSlabLoss(r2);
    check("Case2: damagedSlabCount = 0", loss2.damagedSlabCount === 0);
    check("Case2: lossAmount = 0 (not null)", loss2.lossAmount === 0);
    check("Case2: costPerSlab = 5000", loss2.costPerSlab === 5000);

    // Case 3: no cost recorded yet (both actualAmountPaid and invoicedAmount null).
    const block3 = await prisma.rawBlock.create({
      data: {
        factoryId: factory.id,
        serialNumber: "S3-3",
        varietyName: "Test Granite",
        entrySource: "purchase",
        costStatus: "pending",
        currentStatus: "in_stock",
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block3.id,
        machineId: machine.id,
        startedAt: new Date(),
        endedAt: new Date(),
        status: "completed",
        totalSlabsCut: 8,
        finalGoodSlabCount: 6,
        damagedSlabCount: 2,
      },
    });
    const r3 = await prisma.rawBlock.findFirst({
      where: { id: block3.id },
      include: { transitions: true, slabs: true, cuttingSessions: true },
    });
    const loss3 = computeDamagedSlabLoss(r3);
    check("Case3: costBasis = null", loss3.costBasis === null);
    check("Case3: totalCost = null", loss3.totalCost === null);
    check("Case3: costPerSlab = null", loss3.costPerSlab === null);
    check("Case3: lossAmount = null", loss3.lossAmount === null);
    check("Case3: totalSlabsCut/damagedSlabCount still populated (8/2)", loss3.totalSlabsCut === 8 && loss3.damagedSlabCount === 2);

    // Case 4: no completed CuttingSession yet (no session rows at all).
    const block4 = await prisma.rawBlock.create({
      data: {
        factoryId: factory.id,
        serialNumber: "S3-4",
        varietyName: "Test Granite",
        entrySource: "purchase",
        costStatus: "confirmed",
        currentStatus: "in_stock",
        actualAmountPaid: 75000,
      },
    });
    const r4 = await prisma.rawBlock.findFirst({
      where: { id: block4.id },
      include: { transitions: true, slabs: true, cuttingSessions: true },
    });
    const loss4 = computeDamagedSlabLoss(r4);
    check("Case4: totalSlabsCut = 0", loss4.totalSlabsCut === 0);
    check("Case4: costPerSlab = null", loss4.costPerSlab === null);
    check("Case4: lossAmount = null", loss4.lossAmount === null);
    check("Case4: costBasis still populated (actual_amount_paid)", loss4.costBasis === "actual_amount_paid");

    // Case 5: only invoicedAmount present (actualAmountPaid null) -> fallback works.
    const block5 = await prisma.rawBlock.create({
      data: {
        factoryId: factory.id,
        serialNumber: "S3-5",
        varietyName: "Test Granite",
        entrySource: "purchase",
        costStatus: "pending",
        currentStatus: "in_stock",
        invoicedAmount: 40000,
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block5.id,
        machineId: machine.id,
        startedAt: new Date(),
        endedAt: new Date(),
        status: "completed",
        totalSlabsCut: 4,
        finalGoodSlabCount: 4,
        damagedSlabCount: 0,
      },
    });
    const r5 = await prisma.rawBlock.findFirst({
      where: { id: block5.id },
      include: { transitions: true, slabs: true, cuttingSessions: true },
    });
    const loss5 = computeDamagedSlabLoss(r5);
    check("Case5: costBasis = invoiced_amount (fallback)", loss5.costBasis === "invoiced_amount");
    check("Case5: totalCost = 40000", loss5.totalCost === 40000);

    // Case 6: multiple cutting sessions on one block, sum across them; one
    // session has totalSlabsCut null (e.g. in_progress) and must be excluded.
    const block6 = await prisma.rawBlock.create({
      data: {
        factoryId: factory.id,
        serialNumber: "S3-6",
        varietyName: "Test Granite",
        entrySource: "purchase",
        costStatus: "confirmed",
        currentStatus: "in_stock",
        actualAmountPaid: 90000,
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block6.id,
        machineId: machine.id,
        startedAt: new Date(),
        endedAt: new Date(),
        status: "completed",
        totalSlabsCut: 10,
        finalGoodSlabCount: 9,
        damagedSlabCount: 1,
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block6.id,
        machineId: machine.id,
        startedAt: new Date(),
        endedAt: new Date(),
        status: "completed",
        totalSlabsCut: 5,
        finalGoodSlabCount: 4,
        damagedSlabCount: 1,
      },
    });
    await prisma.cuttingSession.create({
      data: {
        factoryId: factory.id,
        rawBlockId: block6.id,
        machineId: machine.id,
        startedAt: new Date(),
        status: "in_progress",
        // totalSlabsCut/damagedSlabCount left null — not reported yet, must be excluded
      },
    });
    const r6 = await prisma.rawBlock.findFirst({
      where: { id: block6.id },
      include: { transitions: true, slabs: true, cuttingSessions: true },
    });
    const loss6 = computeDamagedSlabLoss(r6);
    check("Case6: totalSlabsCut sums completed sessions only (15)", loss6.totalSlabsCut === 15);
    check("Case6: damagedSlabCount sums completed sessions only (2)", loss6.damagedSlabCount === 2);
    check("Case6: costPerSlab = 6000 (90000/15)", loss6.costPerSlab === 6000);
    check("Case6: lossAmount = 12000 (6000*2)", loss6.lossAmount === 12000);

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // Cleanup — delete in FK-safe order.
    const blockIds = (
      await prisma.rawBlock.findMany({ where: { factoryId: factory.id }, select: { id: true } })
    ).map((b) => b.id);
    await prisma.cuttingSession.deleteMany({ where: { rawBlockId: { in: blockIds } } });
    await prisma.rawBlock.deleteMany({ where: { factoryId: factory.id } });
    await prisma.machine.delete({ where: { id: machine.id } });
    await prisma.factory.delete({ where: { id: factory.id } });
    console.log("Cleanup complete.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
