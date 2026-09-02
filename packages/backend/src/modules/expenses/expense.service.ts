import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

// Matches the real category list surfaced from Vedam Granites' cash-book —
// see stoneos-mvp-schema.sql notes. Keep this list and the DPR entry UI's
// EXPENSE_CATEGORIES in sync manually.
export const EXPENSE_CATEGORIES = [
  "block_rent", "royalty", "block_purchase_transport", "consumables_epoxy_battery",
  "maintenance", "construction", "contractor_pay", "vehicle", "mess", "phone",
  "official", "commission", "medical", "staff_salary", "misc", "loan_payment", "gst_return_paid",
];

interface CreateExpenseInput {
  category: string;
  amount: number;
  expenseDate: string;
  vehicleId?: string;
  toWhom?: string;
}

interface AllocationInput {
  rawBlockId: string;
  allocatedAmount: number;
  allocationMethod: "by_weight" | "by_area" | "manual";
}

@Injectable()
export class ExpenseService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string, from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where: {
        factoryId,
        ...(from && to ? { expenseDate: { gte: new Date(from), lte: new Date(to) } } : {}),
      },
      include: { vehicle: true, allocations: true },
      orderBy: { expenseDate: "desc" },
    });
  }

  create(factoryId: string, input: CreateExpenseInput) {
    if (!EXPENSE_CATEGORIES.includes(input.category)) {
      throw new BadRequestException(`Unknown category: ${input.category}`);
    }
    if (input.category === "vehicle" && !input.vehicleId) {
      throw new BadRequestException("vehicleId is required when category is 'vehicle'");
    }
    return this.prisma.expense.create({
      data: {
        factoryId,
        category: input.category,
        amount: input.amount,
        expenseDate: new Date(input.expenseDate),
        vehicleId: input.vehicleId,
        toWhom: input.toWhom,
      },
    });
  }

  // Cost allocation for cost-per-slab / cost-per-sqft reporting (V2 per
  // the schema notes, but the endpoint shape is worth having now).
  //
  // The whole thing runs inside one interactive transaction, opened by
  // locking the expense row with SELECT ... FOR UPDATE. Reading the existing
  // allocations and writing the new ones must be atomic: without the lock,
  // two concurrent calls could each read the same "already allocated" total,
  // each pass the ceiling check, and together blow past the expense amount.
  async allocate(factoryId: string, expenseId: string, allocations: AllocationInput[]) {
    if (allocations.length === 0) {
      throw new BadRequestException("At least one allocation is required");
    }
    for (const a of allocations) {
      if (!(a.allocatedAmount > 0)) {
        throw new BadRequestException("Every allocatedAmount must be greater than zero");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock the expense for the life of the transaction. Scoped by
      // factory_id so another tenant's expense is never even locked.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM expense WHERE id = ${expenseId} AND factory_id = ${factoryId} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException("Expense not found");
      }

      const expense = await tx.expense.findFirstOrThrow({ where: { id: expenseId, factoryId } });

      // Every referenced raw block must belong to the caller's factory —
      // expense_allocation carries no factory_id of its own, so this is the
      // only tenant boundary on the reference.
      const rawBlockIds = [...new Set(allocations.map((a) => a.rawBlockId))];
      const owned = await tx.rawBlock.findMany({
        where: { id: { in: rawBlockIds }, factoryId },
        select: { id: true },
      });
      if (owned.length !== rawBlockIds.length) {
        throw new BadRequestException("One or more raw blocks do not belong to this factory");
      }

      // Count what is ALREADY allocated against this expense, not just what
      // arrived in this request — otherwise repeated calls each pass on their
      // own and over-allocate in aggregate.
      const priorSum = await tx.expenseAllocation.aggregate({
        where: { expenseId },
        _sum: { allocatedAmount: true },
      });
      const alreadyAllocated = Number(priorSum._sum.allocatedAmount ?? 0);
      const incoming = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);

      if (alreadyAllocated + incoming > Number(expense.amount)) {
        const remaining = Number(expense.amount) - alreadyAllocated;
        throw new BadRequestException(
          `Allocated amount exceeds the expense total. ${remaining.toFixed(2)} of ${Number(expense.amount).toFixed(2)} remains unallocated.`,
        );
      }

      const created = [];
      for (const a of allocations) {
        created.push(
          await tx.expenseAllocation.create({
            data: {
              expenseId,
              rawBlockId: a.rawBlockId,
              allocatedAmount: a.allocatedAmount,
              allocationMethod: a.allocationMethod,
            },
          }),
        );
      }
      return created;
    });
  }
}
