import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ExpenseService } from "./expense.service";

// Builds a prisma double whose $transaction runs the callback against `tx`,
// mirroring Prisma's interactive-transaction shape.
function serviceWith({
  expense = { id: "expense-1", amount: 100 },
  alreadyAllocated = null as number | null,
  ownedBlockIds = ["block-1", "block-2"],
  locked = [{ id: "expense-1" }],
} = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(locked),
    expense: { findFirstOrThrow: jest.fn().mockResolvedValue(expense) },
    rawBlock: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.id.in.filter((id: string) => ownedBlockIds.includes(id)).map((id: string) => ({ id }))),
      ),
    },
    expenseAllocation: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { allocatedAmount: alreadyAllocated } }),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "alloc", ...data })),
    },
  };
  const prisma = { $transaction: jest.fn((op: any) => op(tx)) };
  return { service: new ExpenseService(prisma as any), tx };
}

const alloc = (rawBlockId: string, allocatedAmount: number) => ({
  rawBlockId,
  allocatedAmount,
  allocationMethod: "manual" as const,
});

describe("ExpenseService.allocate", () => {
  describe("input validation", () => {
    it("rejects an empty allocation list", async () => {
      const { service, tx } = serviceWith();

      await expect(service.allocate("factory-1", "expense-1", [])).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it.each([0, -5])("rejects a non-positive allocatedAmount (%s)", async (amount) => {
      const { service, tx } = serviceWith();

      await expect(service.allocate("factory-1", "expense-1", [alloc("block-1", amount)])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("tenant scoping", () => {
    it("locks the expense row scoped to the caller's factory", async () => {
      const { service, tx } = serviceWith();

      await service.allocate("factory-1", "expense-1", [alloc("block-1", 40)]);

      // The lock is what makes the read-then-write below safe under concurrency.
      const sql = tx.$queryRaw.mock.calls[0][0].join("?");
      expect(sql).toMatch(/FOR UPDATE/);
      expect(tx.$queryRaw.mock.calls[0]).toEqual(expect.arrayContaining(["expense-1", "factory-1"]));
    });

    it("refuses an expense belonging to another factory", async () => {
      const { service, tx } = serviceWith({ locked: [] });

      await expect(service.allocate("factory-1", "expense-1", [alloc("block-1", 10)])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.expenseAllocation.create).not.toHaveBeenCalled();
    });

    it("refuses a raw block belonging to another factory", async () => {
      const { service, tx } = serviceWith({ ownedBlockIds: ["block-1"] });

      await expect(
        service.allocate("factory-1", "expense-1", [alloc("block-1", 10), alloc("block-99", 10)]),
      ).rejects.toThrow(/do not belong to this factory/);
      expect(tx.expenseAllocation.create).not.toHaveBeenCalled();
    });

    it("checks raw-block ownership scoped to the factory", async () => {
      const { service, tx } = serviceWith();

      await service.allocate("factory-1", "expense-1", [alloc("block-1", 10)]);

      expect(tx.rawBlock.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["block-1"] }, factoryId: "factory-1" },
        select: { id: true },
      });
    });
  });

  describe("the allocation ceiling", () => {
    it("rejects a single request that exceeds the expense total", async () => {
      const { service, tx } = serviceWith();

      await expect(
        service.allocate("factory-1", "expense-1", [alloc("block-1", 60), alloc("block-2", 60)]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.expenseAllocation.create).not.toHaveBeenCalled();
    });

    // The defect this method used to have: the ceiling counted only the
    // current request, so repeated calls each passed on their own and
    // over-allocated in aggregate.
    it("counts allocations already stored against the expense", async () => {
      const { service, tx } = serviceWith({ alreadyAllocated: 80 });

      await expect(service.allocate("factory-1", "expense-1", [alloc("block-1", 30)])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.expenseAllocation.create).not.toHaveBeenCalled();
    });

    it("reports how much of the expense remains unallocated", async () => {
      const { service } = serviceWith({ alreadyAllocated: 80 });

      await expect(service.allocate("factory-1", "expense-1", [alloc("block-1", 30)])).rejects.toThrow(
        /20\.00 of 100\.00 remains unallocated/,
      );
    });

    it("allows an allocation that exactly consumes the remainder", async () => {
      const { service, tx } = serviceWith({ alreadyAllocated: 80 });

      await service.allocate("factory-1", "expense-1", [alloc("block-1", 20)]);

      expect(tx.expenseAllocation.create).toHaveBeenCalledTimes(1);
    });

    it("treats an expense with no prior allocations as fully available", async () => {
      const { service, tx } = serviceWith({ alreadyAllocated: null });

      await service.allocate("factory-1", "expense-1", [alloc("block-1", 100)]);

      expect(tx.expenseAllocation.create).toHaveBeenCalledTimes(1);
    });
  });

  it("writes every allocation inside the one transaction", async () => {
    const { service, tx } = serviceWith();

    const result = await service.allocate("factory-1", "expense-1", [alloc("block-1", 30), alloc("block-2", 30)]);

    expect(tx.expenseAllocation.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(tx.expenseAllocation.create).toHaveBeenCalledWith({
      data: {
        expenseId: "expense-1",
        rawBlockId: "block-1",
        allocatedAmount: 30,
        allocationMethod: "manual",
      },
    });
  });
});
