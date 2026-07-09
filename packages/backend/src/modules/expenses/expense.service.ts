import { Injectable, BadRequestException } from "@nestjs/common";
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
  // the schema notes, but the endpoint shape is worth having now). Rejects
  // over-allocation past the expense's own amount to keep the numbers honest.
  async allocate(factoryId: string, expenseId: string, allocations: AllocationInput[]) {
    const expense = await this.prisma.expense.findFirstOrThrow({ where: { id: expenseId, factoryId } });
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    if (totalAllocated > Number(expense.amount)) {
      throw new BadRequestException("Allocated amount exceeds the expense total");
    }

    return this.prisma.$transaction(
      allocations.map((a) =>
        this.prisma.expenseAllocation.create({
          data: { expenseId, rawBlockId: a.rawBlockId, allocatedAmount: a.allocatedAmount, allocationMethod: a.allocationMethod },
        }),
      ),
    );
  }
}
