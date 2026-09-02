import { SlabService } from "./slab.service";

// Written against stoneos3's own SlabService. ston3gpt's spec covers an
// `eligibleForPolishing()` LPM stage gate (CUT_UNPOLISHED → GRINDING,
// EPOXY_APPLIED → POLISHING) built on its InventoryLocation/reservation model;
// none of that exists here, so this covers the state-transition path instead.
describe("SlabService", () => {
  function serviceWith(slab: unknown) {
    const prisma = {
      slab: {
        findFirstOrThrow: jest.fn().mockResolvedValue(slab),
        update: jest.fn(),
      },
      slabStateTransition: { create: jest.fn() },
      $transaction: jest.fn((operations: unknown[]) => Promise.resolve(operations)),
    };
    return { service: new SlabService(prisma as any), prisma };
  }

  it("scopes the slab lookup to the caller's factory", async () => {
    const { service, prisma } = serviceWith({ id: "slab-1", salesStatus: "in_stock" });

    await service.transition("factory-1", "slab-1", "sold", "user-1");

    expect(prisma.slab.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "slab-1", factoryId: "factory-1" },
    });
  });

  it("records the slab's current status as the transition's fromState", async () => {
    const { service, prisma } = serviceWith({ id: "slab-1", salesStatus: "in_stock" });

    await service.transition("factory-1", "slab-1", "reserved", "user-1", "machine-1", "held for customer");

    expect(prisma.slabStateTransition.create).toHaveBeenCalledWith({
      data: {
        slabId: "slab-1",
        fromState: "in_stock",
        toState: "reserved",
        machineId: "machine-1",
        userId: "user-1",
        notes: "held for customer",
      },
    });
  });

  it("writes the transition record and the new status in one transaction", async () => {
    const { service, prisma } = serviceWith({ id: "slab-1", salesStatus: "in_stock" });

    await service.transition("factory-1", "slab-1", "sold", "user-1");

    expect(prisma.slab.update).toHaveBeenCalledWith({
      where: { id: "slab-1" },
      data: { salesStatus: "sold" },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Both writes must be in the same transaction array — a slab whose status
    // moved without an audit row (or vice versa) is the failure this guards.
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it("creates slabs in stock and scoped to the factory", () => {
    const create = jest.fn();
    new SlabService({ slab: { create } } as any).create("factory-1", {
      parentBlockId: "block-1",
      slabSerial: "V101/50/01",
      varietyName: "Vedam Black",
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ factoryId: "factory-1", salesStatus: "in_stock", slabSerial: "V101/50/01" }),
    });
  });

  it("scopes the list to one factory", () => {
    const findMany = jest.fn();
    new SlabService({ slab: { findMany } } as any).findAll("factory-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { factoryId: "factory-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});
