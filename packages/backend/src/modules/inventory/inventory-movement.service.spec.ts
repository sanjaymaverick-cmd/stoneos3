import { BadRequestException, NotFoundException } from "@nestjs/common";
import { InventoryMovementService } from "./inventory-movement.service";

function txDouble({
  existingByKey = null as any,
  block = { id: "block-1" } as { id: string } | null,
  slab = { id: "slab-1" } as { id: string } | null,
  ownedLocationIds = ["loc-1", "loc-2"],
} = {}) {
  return {
    inventoryMovement: {
      findFirst: jest.fn().mockResolvedValue(existingByKey),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "mv-new", ...data })),
    },
    rawBlock: { findFirst: jest.fn().mockResolvedValue(block) },
    slab: { findFirst: jest.fn().mockResolvedValue(slab) },
    inventoryLocation: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.id.in.filter((id: string) => ownedLocationIds.includes(id)).map((id: string) => ({ id }))),
      ),
    },
  };
}

function serviceWith(tx = txDouble()) {
  const prisma = { $transaction: jest.fn((op: any) => op(tx)) };
  return { service: new InventoryMovementService(prisma as any), tx };
}

const validInput = {
  movementType: "OPENING_RECEIPT" as const,
  rawBlockId: "block-1",
  toLocationId: "loc-1",
  referenceType: "opening",
  referenceId: "snap-1",
  idempotencyKey: "key-1",
};

describe("InventoryMovementService.record", () => {
  it("appends a movement with the caller as createdBy", async () => {
    const { service, tx } = serviceWith();

    const result = await service.record("factory-1", "user-1", validInput);

    expect(result).toMatchObject({ factoryId: "factory-1", createdBy: "user-1", movementType: "OPENING_RECEIPT" });
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
  });

  it("defaults quantity to 1", async () => {
    const { service, tx } = serviceWith();

    await service.record("factory-1", "user-1", validInput);

    expect(tx.inventoryMovement.create.mock.calls[0][0].data.quantity).toBe(1);
  });

  describe("subject rules", () => {
    it("refuses a movement naming both a block and a slab", async () => {
      const { service, tx } = serviceWith();

      await expect(
        service.record("factory-1", "user-1", { ...validInput, slabId: "slab-1" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("refuses a movement naming neither", async () => {
      const { service, tx } = serviceWith();
      const { rawBlockId, ...noSubject } = validInput;

      await expect(service.record("factory-1", "user-1", noSubject as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("refuses a movement with neither a from nor a to location", async () => {
      const { service } = serviceWith();
      const { toLocationId, ...noDirection } = validInput;

      await expect(service.record("factory-1", "user-1", noDirection as any)).rejects.toThrow(
        /fromLocationId or toLocationId/,
      );
    });
  });

  describe("quantity rules", () => {
    it.each([0, -1])("refuses quantity %s", async (quantity) => {
      const { service } = serviceWith();

      await expect(service.record("factory-1", "user-1", { ...validInput, quantity })).rejects.toThrow(
        /quantity must be greater than zero/,
      );
    });

    it("refuses a non-positive areaSqft when supplied", async () => {
      const { service } = serviceWith();

      await expect(service.record("factory-1", "user-1", { ...validInput, areaSqft: 0 })).rejects.toThrow(
        /areaSqft/,
      );
    });
  });

  describe("tenant scoping", () => {
    it("refuses a raw block from another factory", async () => {
      const { service, tx } = serviceWith(txDouble({ block: null }));

      await expect(service.record("factory-1", "user-1", validInput)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("refuses a location from another factory", async () => {
      const { service, tx } = serviceWith(txDouble({ ownedLocationIds: [] }));

      await expect(service.record("factory-1", "user-1", validInput)).rejects.toThrow(
        /locations do not belong to this factory/,
      );
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("scopes the raw-block lookup by factory", async () => {
      const { service, tx } = serviceWith();

      await service.record("factory-1", "user-1", validInput);

      expect(tx.rawBlock.findFirst).toHaveBeenCalledWith({
        where: { id: "block-1", factoryId: "factory-1" },
        select: { id: true },
      });
    });
  });

  describe("idempotency", () => {
    it("returns the original row for a repeated key instead of posting twice", async () => {
      const original = { id: "mv-original", idempotencyKey: "key-1" };
      const { service, tx } = serviceWith(txDouble({ existingByKey: original }));

      await expect(service.record("factory-1", "user-1", validInput)).resolves.toBe(original);
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });

  it("refuses a REVERSAL posted through record()", async () => {
    const { service } = serviceWith();

    await expect(
      service.record("factory-1", "user-1", { ...validInput, movementType: "REVERSAL" as any }),
    ).rejects.toThrow(/Use reverse\(\)/);
  });
});

describe("InventoryMovementService.reverse", () => {
  function reverseSetup(original: any, extras: any = {}) {
    const tx = {
      inventoryMovement: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(original) // the original
          .mockResolvedValueOnce(extras.alreadyReversed ?? null) // existing reversal
          .mockResolvedValueOnce(extras.existingByKey ?? null), // idempotency
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "mv-rev", ...data })),
      },
    };
    const prisma = { $transaction: jest.fn((op: any) => op(tx)) };
    return { service: new InventoryMovementService(prisma as any), tx };
  }

  const original = {
    id: "mv-1",
    movementType: "TRANSFER",
    rawBlockId: "block-1",
    slabId: null,
    fromLocationId: "loc-1",
    toLocationId: "loc-2",
    quantity: 1,
    areaSqft: null,
  };

  it("mirrors the original with its locations swapped", async () => {
    const { service, tx } = reverseSetup(original);

    await service.reverse("factory-1", "user-1", "mv-1", "counted wrong", "rev-key");

    expect(tx.inventoryMovement.create.mock.calls[0][0].data).toMatchObject({
      movementType: "REVERSAL",
      rawBlockId: "block-1",
      fromLocationId: "loc-2",
      toLocationId: "loc-1",
      reversesMovementId: "mv-1",
      reason: "counted wrong",
    });
  });

  it("never mutates the original row", async () => {
    const { service, tx } = reverseSetup(original);

    await service.reverse("factory-1", "user-1", "mv-1", "counted wrong", "rev-key");

    // Only a create — an append-only ledger has no update path at all.
    expect(tx.inventoryMovement).not.toHaveProperty("update");
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
  });

  it("requires a reason", async () => {
    const { service } = reverseSetup(original);

    await expect(service.reverse("factory-1", "user-1", "mv-1", "   ", "rev-key")).rejects.toThrow(/reason/);
  });

  it("refuses to reverse a reversal", async () => {
    const { service } = reverseSetup({ ...original, movementType: "REVERSAL" });

    await expect(service.reverse("factory-1", "user-1", "mv-1", "why", "rev-key")).rejects.toThrow(
      /cannot itself be reversed/,
    );
  });

  it("refuses a second reversal of the same movement", async () => {
    const { service } = reverseSetup(original, { alreadyReversed: { id: "mv-rev-existing" } });

    await expect(service.reverse("factory-1", "user-1", "mv-1", "why", "rev-key")).rejects.toThrow(
      /already been reversed/,
    );
  });

  it("refuses a movement from another factory", async () => {
    const { service } = reverseSetup(null);

    await expect(service.reverse("factory-1", "user-1", "mv-1", "why", "rev-key")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("InventoryMovementService.history", () => {
  it("requires a subject", () => {
    const service = new InventoryMovementService({} as any);

    expect(() => service.history("factory-1", {})).toThrow(BadRequestException);
  });

  it("returns one item's movements oldest first, scoped to the factory", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new InventoryMovementService({ inventoryMovement: { findMany } } as any);

    await service.history("factory-1", { rawBlockId: "block-1" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { factoryId: "factory-1", rawBlockId: "block-1" },
        orderBy: { occurredAt: "asc" },
      }),
    );
  });
});
