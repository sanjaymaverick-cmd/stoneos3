import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { OpeningInventoryService } from "./opening-inventory.service";

const LOCATION = { id: "loc-yard", code: "RAW_YARD" };

function build({ snapshot = { id: "snap-1", status: "DRAFT", createdBy: "counter" } as any, lines = [] as any[] } = {}) {
  const tx = {
    openingInventorySnapshot: {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue(snapshot),
    },
    openingInventoryLine: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "line-new", ...data })),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    factory: { update: jest.fn().mockResolvedValue({}) },
    rawBlock: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "block-1" }), update: jest.fn(), delete: jest.fn() },
    slab: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "slab-1" }), update: jest.fn(), delete: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn((op: any) => op(tx)),
    openingInventorySnapshot: {
      findFirst: jest.fn().mockResolvedValue(snapshot ? { ...snapshot, lines } : null),
    },
    openingInventoryLine: { count: jest.fn().mockResolvedValue(lines.length) },
  };
  const locations = {
    ensureDefaults: jest.fn().mockResolvedValue([]),
    findByCode: jest.fn().mockResolvedValue(LOCATION),
  };
  const movements = { recordIn: jest.fn().mockResolvedValue({ id: "mv-1" }) };

  const service = new OpeningInventoryService(prisma as any, locations as any, movements as any);
  // findOne re-reads; stub it so tests assert behaviour rather than plumbing.
  jest.spyOn(service, "findOne").mockResolvedValue({ ...snapshot, lines } as any);
  return { service, prisma, tx, locations, movements };
}

describe("OpeningInventoryService.start", () => {
  it("refuses a second count once one is approved", async () => {
    const { service } = build({ snapshot: { id: "snap-old", status: "APPROVED" } });

    await expect(service.start("factory-1", "u1", { countDate: "2026-09-01" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("seeds the factory's locations before anything can be placed", async () => {
    const { service, locations, prisma } = build({ snapshot: null as any });
    prisma.openingInventorySnapshot.findFirst.mockResolvedValue(null);
    (prisma as any).$transaction = jest.fn(async (op: any) =>
      op({
        openingInventorySnapshot: { create: jest.fn().mockResolvedValue({ id: "snap-new" }) },
        factory: { update: jest.fn() },
      }),
    );
    jest.spyOn(service, "findOne").mockResolvedValue({ id: "snap-new" } as any);

    await service.start("factory-1", "u1", { countDate: "2026-09-01" });

    expect(locations.ensureDefaults).toHaveBeenCalledWith("factory-1");
  });
});

describe("OpeningInventoryService counting steps", () => {
  it("records an opening block as an estimated opening balance, not a purchase", async () => {
    const { service, tx } = build();

    await service.addRawBlock("factory-1", "snap-1", { serialNumber: "V1", varietyName: "Vedam Black" });

    expect(tx.rawBlock.create.mock.calls[0][0].data).toMatchObject({
      entrySource: "opening_balance",
      costStatus: "estimated",
    });
  });

  it("refuses a duplicate block serial", async () => {
    const { service, tx } = build();
    tx.rawBlock.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      service.addRawBlock("factory-1", "snap-1", { serialNumber: "V1", varietyName: "X" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.rawBlock.create).not.toHaveBeenCalled();
  });

  it("derives slab area from length x width when not given", async () => {
    const { service, tx } = build();

    await service.addSlab("factory-1", "snap-1", {
      slabSerial: "S1", varietyName: "X", kind: "UNPOLISHED_SLAB", lengthFt: 8, widthFt: 5,
    });

    expect(tx.openingInventoryLine.create.mock.calls[0][0].data.areaSqft).toBe(40);
  });

  it("creates an opening slab with no parent block", async () => {
    const { service, tx } = build();

    await service.addSlab("factory-1", "snap-1", { slabSerial: "S1", varietyName: "X", kind: "POLISHED_SLAB" });

    expect(tx.slab.create.mock.calls[0][0].data).not.toHaveProperty("parentBlockId");
  });

  it("refuses an unknown location code", async () => {
    const { service, locations } = build();
    locations.findByCode.mockResolvedValue(null);

    await expect(
      service.addRawBlock("factory-1", "snap-1", { serialNumber: "V1", varietyName: "X", locationCode: "MOON" }),
    ).rejects.toThrow(/Unknown location/);
  });

  it.each(["SUBMITTED", "APPROVED", "REJECTED"])("refuses edits once the count is %s", async (status) => {
    const { service } = build({ snapshot: { id: "snap-1", status } });

    await expect(
      service.addRawBlock("factory-1", "snap-1", { serialNumber: "V1", varietyName: "X" }),
    ).rejects.toThrow(/can no longer be edited/);
  });
});

describe("OpeningInventoryService.submit", () => {
  it("refuses an empty count", async () => {
    const { service } = build({ lines: [] });

    await expect(service.submit("factory-1", "snap-1", "u1")).rejects.toThrow(/at least one item/);
  });

  it("moves the factory to pending approval", async () => {
    const { service, tx } = build({ lines: [{ id: "l1" }] });

    await service.submit("factory-1", "snap-1", "u1");

    expect(tx.factory.update.mock.calls[0][0].data).toEqual({ operatingStatus: "OPENING_PENDING_APPROVAL" });
  });
});

describe("OpeningInventoryService.approve", () => {
  const lines = [
    { id: "l1", rawBlockId: "block-1", slabId: null, locationId: "loc-yard", areaSqft: null },
    { id: "l2", rawBlockId: null, slabId: "slab-1", locationId: "loc-fin", areaSqft: 40 },
  ];
  const submitted = { id: "snap-1", status: "SUBMITTED", createdBy: "counter" };

  it("refuses anything that is not submitted", async () => {
    const { service } = build({ snapshot: { ...submitted, status: "DRAFT" }, lines });

    await expect(service.approve("factory-1", "snap-1", "approver")).rejects.toBeInstanceOf(BadRequestException);
  });

  // Separation of duties: the person who counted cannot also sign it off.
  it("refuses approval by the person who created the count", async () => {
    const { service } = build({ snapshot: submitted, lines });

    await expect(service.approve("factory-1", "snap-1", "counter")).rejects.toThrow(
      /other than the person who counted/,
    );
  });

  it("places every counted item in its location", async () => {
    const { service, tx } = build({ snapshot: submitted, lines });

    await service.approve("factory-1", "snap-1", "approver");

    expect(tx.rawBlock.update).toHaveBeenCalledWith({ where: { id: "block-1" }, data: { locationId: "loc-yard" } });
    expect(tx.slab.update).toHaveBeenCalledWith({ where: { id: "slab-1" }, data: { locationId: "loc-fin" } });
  });

  it("posts one OPENING_RECEIPT per line, keyed off the line id", async () => {
    const { service, movements } = build({ snapshot: submitted, lines });

    await service.approve("factory-1", "snap-1", "approver");

    expect(movements.recordIn).toHaveBeenCalledTimes(2);
    // The key is derived, not random, so a retried approval cannot double-post.
    expect(movements.recordIn.mock.calls[0][3]).toMatchObject({
      movementType: "OPENING_RECEIPT",
      idempotencyKey: "opening:l1",
    });
  });

  it("flips the factory LIVE in the same transaction that places the stock", async () => {
    const { service, tx, prisma } = build({ snapshot: submitted, lines });

    await service.approve("factory-1", "snap-1", "approver");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const factoryCalls = tx.factory.update.mock.calls;
    expect(factoryCalls[factoryCalls.length - 1][0].data).toEqual({ operatingStatus: "LIVE" });
  });

  it("refuses a count from another factory", async () => {
    const { service, prisma } = build();
    prisma.openingInventorySnapshot.findFirst.mockResolvedValue(null);

    await expect(service.approve("factory-1", "snap-1", "approver")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OpeningInventoryService.reject", () => {
  it("requires a reason", async () => {
    const { service } = build({ snapshot: { id: "snap-1", status: "SUBMITTED" } });

    await expect(service.reject("factory-1", "snap-1", "u1", "  ")).rejects.toThrow(/reason/);
  });

  it("sends the factory back to counting rather than leaving it pending", async () => {
    const { service, tx } = build({ snapshot: { id: "snap-1", status: "SUBMITTED" } });

    await service.reject("factory-1", "snap-1", "u1", "recount the yard");

    expect(tx.factory.update.mock.calls[0][0].data).toEqual({ operatingStatus: "OPENING_COUNT_IN_PROGRESS" });
  });
});
