import { BadRequestException } from "@nestjs/common";
import { ExpenseService } from "./expense.service";

// Written against stoneos3's own ExpenseService. ston3gpt's version of this
// spec could not be ported: its `allocate` takes an idempotency key as a third
// argument, aggregates previously-stored allocations, and tenant-checks every
// referenced raw block — none of which this implementation does. See the two
// gaps recorded at the bottom.
describe("ExpenseService.allocate", () => {
  function serviceWith(expense: unknown) {
    const create = jest.fn();
    const prisma = {
      expense: { findFirstOrThrow: jest.fn().mockResolvedValue(expense) },
      expenseAllocation: { create },
      $transaction: jest.fn((operations: unknown[]) => Promise.resolve(operations)),
    };
    return { service: new ExpenseService(prisma as any), prisma, create };
  }

  it("scopes the expense lookup to the caller's factory", async () => {
    const { service, prisma } = serviceWith({ id: "expense-1", amount: 100 });

    await service.allocate("factory-1", "expense-1", [
      { rawBlockId: "block-1", allocatedAmount: 40, allocationMethod: "manual" },
    ]);

    expect(prisma.expense.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "expense-1", factoryId: "factory-1" },
    });
  });

  it("rejects a request whose allocations exceed the expense total", async () => {
    const { service, create } = serviceWith({ id: "expense-1", amount: 100 });

    await expect(
      service.allocate("factory-1", "expense-1", [
        { rawBlockId: "block-1", allocatedAmount: 60, allocationMethod: "manual" },
        { rawBlockId: "block-2", allocatedAmount: 60, allocationMethod: "manual" },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows allocating exactly the expense total", async () => {
    const { service, create } = serviceWith({ id: "expense-1", amount: 100 });

    await service.allocate("factory-1", "expense-1", [
      { rawBlockId: "block-1", allocatedAmount: 100, allocationMethod: "manual" },
    ]);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("writes every allocation inside a single transaction", async () => {
    const { service, prisma, create } = serviceWith({ id: "expense-1", amount: 100 });

    await service.allocate("factory-1", "expense-1", [
      { rawBlockId: "block-1", allocatedAmount: 30, allocationMethod: "manual" },
      { rawBlockId: "block-2", allocatedAmount: 30, allocationMethod: "manual" },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // GAP 1 (documented, not enforced): the over-allocation check sums ONLY the
  // allocations in the current request. Existing rows for the same expense are
  // never queried, so two sequential calls of 100 against a 100 expense both
  // pass. README describes this endpoint as rejecting over-allocation past the
  // expense total, which holds per-request but not cumulatively.
  //
  // GAP 2 (documented, not enforced): rawBlockId is written straight through
  // with no check that the block belongs to the caller's factory.
  it("checks allocation totals per request only, not cumulatively", async () => {
    const { service, create } = serviceWith({ id: "expense-1", amount: 100 });

    // First call consumes the whole expense.
    await service.allocate("factory-1", "expense-1", [
      { rawBlockId: "block-1", allocatedAmount: 100, allocationMethod: "manual" },
    ]);
    // Second identical call is accepted too — the service never looks at what
    // is already allocated. Asserted so the behaviour change is caught when
    // the cumulative check lands.
    await service.allocate("factory-1", "expense-1", [
      { rawBlockId: "block-2", allocatedAmount: 100, allocationMethod: "manual" },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
  });
});
