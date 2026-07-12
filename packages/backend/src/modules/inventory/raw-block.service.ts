import { Injectable, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { AuthenticatedUser } from "../../common/decorators/current-user.decorator";

// transfer_in is deliberately NOT accepted yet — Project Owner decision
// (2026-07-11): "no cross factory data transfer. all factories independent
// units. once we are ready for multi factory setup in app we will add that
// in login process so no cross factory data leak happens." The
// sourceFactoryId/transferredFromBlockId schema fields stay in place for
// when that's built properly at the login/access layer, but this service
// must not read or write them, and must not query another factory's rows
// under any circumstance.
type EntrySource = "purchase" | "opening_balance";
type StartingState = "raw_yard" | "mid_cutting" | "finished_stock";

interface CreateRawBlockInput {
  serialNumber: string;
  varietyName: string;
  weightTons?: number;
  entrySource?: EntrySource; // defaults to "purchase" — keeps existing callers working unchanged

  // entrySource = "purchase"
  supplierId?: string;
  purchaseDate?: string;
  invoicedAmount?: number;
  actualAmountPaid?: number;
  gstRate?: number;

  // entrySource = "opening_balance"
  startingState?: StartingState;
  cuttingMachineId?: string;   // mid_cutting / finished_stock: the B-21
  polishingMachineId?: string; // finished_stock only: the LPM
  slabsAlreadyCut?: number;    // mid_cutting: how many are already cut
  expectedTotalSlabs?: number; // mid_cutting / finished_stock: total for the serial format
  finish?: string;             // finished_stock: glossy / leather -> PolishingSession.finishType
}

interface TransitionInput {
  toState: string;
  machineId?: string;
  userId: string;
  notes?: string;
}

const RECONCILE_FIELDS = ["weightTons", "invoicedAmount", "actualAmountPaid"] as const;
type ReconcileField = (typeof RECONCILE_FIELDS)[number];

const ENTRY_SOURCES = ["purchase", "opening_balance"] as const;
const STARTING_STATES = ["raw_yard", "mid_cutting", "finished_stock"] as const;

// Only these roles may record a block that didn't come through a normal
// purchase — opening balance bypasses the invoice trail, so it needs a
// human who's accountable for the figure being approximate.
const ELEVATED_ROLES = ["owner", "admin", "manager"];

@Injectable()
export class RawBlockService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.rawBlock.findMany({
      where: { factoryId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(factoryId: string, id: string) {
    const block = await this.prisma.rawBlock.findFirst({
      where: { id, factoryId },
      include: { transitions: { orderBy: { occurredAt: "asc" } }, slabs: true, cuttingSessions: true },
    });
    if (!block) return block;

    return { ...block, damagedSlabLoss: this.computeDamagedSlabLoss(block) };
  }

  // Read-only computed value — never persisted. Purchase-price cost basis only
  // (actualAmountPaid, falling back to invoicedAmount): Owner explicitly chose
  // this over purchase+allocated-expenses (ExpenseAllocation is untouched here)
  // for simplicity/availability. Per-slab cost divides by the PHYSICAL slab
  // count (good + damaged), not finalGoodSlabCount, per the schema comment on
  // CuttingSession.damagedSlabCount (schema.prisma:147-151) — damage happens
  // before polishing/finishing adds value, so it's valued at raw block cost,
  // never finished slab price.
  private computeDamagedSlabLoss(block: {
    actualAmountPaid: unknown;
    invoicedAmount: unknown;
    cuttingSessions: { totalSlabsCut: number | null; damagedSlabCount: number | null }[];
  }) {
    const costBasis: "actual_amount_paid" | "invoiced_amount" | null =
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

  // See the RECOVERY RATIO comment on `model RawBlock` in schema.prisma: actual sqft sold
  // (sale-time SalesLineItem.quantity, never Slab.lengthFt/widthFt — those are provisional
  // production-stage placeholders) divided by weightTons, benchmarked at 105 sqft/ton.
  // `soldSqft` is summed by navigating block -> slabs -> salesLines (the inverse of
  // SalesLineItem.slabId), so a SalesLineItem with a null slabId is structurally invisible
  // here and never contributes to any block's total — no extra filtering needed for that case.
  async findRecoveryRatios(factoryId: string) {
    const blocks = await this.prisma.rawBlock.findMany({
      where: { factoryId },
      orderBy: { createdAt: "desc" },
      include: { slabs: { include: { salesLines: true } } },
    });

    return blocks.map(({ slabs, ...block }) => ({
      ...block,
      ...this.computeRecoveryRatio({ weightTons: block.weightTons, slabs }),
    }));
  }

  private computeRecoveryRatio(block: {
    weightTons: unknown;
    slabs: { salesLines: { quantity: unknown }[] }[];
  }) {
    const soldSqft = block.slabs.reduce(
      (sum, slab) => sum + slab.salesLines.reduce((s, line) => s + Number(line.quantity), 0),
      0,
    );
    const weightTons = block.weightTons != null ? Number(block.weightTons) : null;
    const benchmark = 105;

    // A block with nothing sold yet has no ratio to report, not a ratio of 0 —
    // per the brief, soldSqft === 0 must yield null, same as a missing/zero weight.
    const recoveryRatio = weightTons != null && weightTons > 0 && soldSqft > 0 ? soldSqft / weightTons : null;
    const belowBenchmark = recoveryRatio != null ? recoveryRatio < benchmark : null;

    return { soldSqft, recoveryRatio, benchmark, belowBenchmark };
  }

  async create(user: AuthenticatedUser, input: CreateRawBlockInput) {
    const factoryId = user.factoryId;
    const entrySource: EntrySource = input.entrySource ?? "purchase";

    if (!ENTRY_SOURCES.includes(entrySource)) {
      throw new BadRequestException(`entrySource must be one of: ${ENTRY_SOURCES.join(", ")}`);
    }

    if (input.startingState !== undefined && !STARTING_STATES.includes(input.startingState)) {
      throw new BadRequestException(`startingState must be one of: ${STARTING_STATES.join(", ")}`);
    }

    if (entrySource !== "purchase" && !ELEVATED_ROLES.includes(user.role)) {
      throw new ForbiddenException(`Only owner/admin/manager can record a ${entrySource} entry`);
    }

    if (entrySource === "opening_balance" && input.startingState === "mid_cutting") {
      if (!input.cuttingMachineId) {
        throw new BadRequestException("cuttingMachineId is required for a mid_cutting opening balance");
      }
      if (!input.expectedTotalSlabs) {
        throw new BadRequestException("expectedTotalSlabs is required for a mid_cutting opening balance");
      }
      await this.validateMachineType(factoryId, input.cuttingMachineId, "cutting");
    }

    if (entrySource === "opening_balance" && input.startingState === "finished_stock") {
      if (!input.cuttingMachineId) {
        throw new BadRequestException("cuttingMachineId is required for finished_stock opening balance");
      }
      if (!input.polishingMachineId) {
        throw new BadRequestException("polishingMachineId is required for finished_stock opening balance");
      }
      if (!input.expectedTotalSlabs) {
        throw new BadRequestException("expectedTotalSlabs is required for finished_stock opening balance");
      }
      if (!input.finish) {
        throw new BadRequestException("finish is required for finished_stock opening balance");
      }
      await this.validateMachineType(factoryId, input.cuttingMachineId, "cutting");
      await this.validateMachineType(factoryId, input.polishingMachineId, "polishing");
    }

    const costStatus =
      entrySource === "purchase"
        ? input.invoicedAmount != null
          ? "confirmed"
          : "pending"
        : "estimated"; // opening_balance — approximate figure, not a real invoice

    const currentStatus =
      entrySource !== "opening_balance"
        ? "in_stock"
        : input.startingState === "mid_cutting"
          ? "in_cutting"
          : input.startingState === "finished_stock"
            ? "polished_in_stock"
            : "in_stock";

    return this.prisma.$transaction(async (tx) => {
      const block = await tx.rawBlock.create({
        data: {
          factoryId,
          serialNumber: input.serialNumber,
          varietyName: input.varietyName,
          weightTons: input.weightTons,
          entrySource,
          costStatus,
          currentStatus,
          supplierId: input.supplierId,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
          invoicedAmount: input.invoicedAmount,
          actualAmountPaid: input.actualAmountPaid,
          gstRate: input.gstRate,
        },
      });

      // Every block's first transition — fromState is null on purpose.
      // This is where the block "appears" in the system, whatever its
      // real physical state already is at that moment. Deliberate behavior
      // addition to the purchase path too (see review request).
      await tx.blockStateTransition.create({
        data: {
          rawBlockId: block.id,
          fromState: null,
          toState: currentStatus,
          userId: user.id,
          notes: entrySource === "purchase" ? undefined : `${entrySource} entry recorded by ${user.email}`,
        },
      });

      // Mid-cutting: reconstruct the cutting session so slab numbering
      // (block/total/sequence) has a place to read its total from, and
      // so the session can be continued and closed normally from here.
      if (entrySource === "opening_balance" && input.startingState === "mid_cutting") {
        const expectedTotalSlabs = input.expectedTotalSlabs!;
        const session = await tx.cuttingSession.create({
          data: {
            factoryId,
            rawBlockId: block.id,
            machineId: input.cuttingMachineId!,
            startedAt: new Date(), // approximate — the real start predates StoneOS
            status: "in_progress",
            expectedSlabCount: expectedTotalSlabs,
            isBackfilled: true,
          },
        });

        if (input.slabsAlreadyCut) {
          await tx.slab.createMany({
            data: Array.from({ length: input.slabsAlreadyCut }, (_, i) => ({
              factoryId,
              parentBlockId: block.id,
              cuttingSessionId: session.id,
              slabSerial: `${input.serialNumber}/${expectedTotalSlabs}/${String(i + 1).padStart(2, "0")}`,
              varietyName: input.varietyName,
              isBackfilled: true,
            })),
          });
        }
      }

      // Finished stock: reconstruct both sessions so the slabs have a
      // real cuttingSessionId/polishingSessionId to hang off — same
      // shape as a normally-produced slab, just backdated.
      if (entrySource === "opening_balance" && input.startingState === "finished_stock") {
        const expectedTotalSlabs = input.expectedTotalSlabs!;
        const session = await tx.cuttingSession.create({
          data: {
            factoryId,
            rawBlockId: block.id,
            machineId: input.cuttingMachineId!,
            startedAt: new Date(),
            endedAt: new Date(),
            status: "completed",
            expectedSlabCount: expectedTotalSlabs,
            totalSlabsCut: expectedTotalSlabs,
            finalGoodSlabCount: expectedTotalSlabs,
            damagedSlabCount: 0,
            isBackfilled: true,
          },
        });

        const polishing = await tx.polishingSession.create({
          data: {
            factoryId,
            machineId: input.polishingMachineId!,
            operationalDate: new Date(),
            finishType: input.finish!,
            isBackfilled: true,
          },
        });

        const slabs = await Promise.all(
          Array.from({ length: expectedTotalSlabs }, (_, i) =>
            tx.slab.create({
              data: {
                factoryId,
                parentBlockId: block.id,
                cuttingSessionId: session.id,
                slabSerial: `${input.serialNumber}/${expectedTotalSlabs}/${String(i + 1).padStart(2, "0")}`,
                varietyName: input.varietyName,
                finish: input.finish,
                salesStatus: "in_stock",
                isBackfilled: true,
              },
            }),
          ),
        );

        await tx.polishingSessionSlab.createMany({
          data: slabs.map((s) => ({ polishingSessionId: polishing.id, slabId: s.id })),
        });
      }

      return block;
    });
  }

  // Scoped by factoryId — an opening_balance intake has no legitimate reason
  // to reference another factory's machine (transfer_in, the one case that
  // would have been intentionally cross-factory, is not enabled — see the
  // note at the top of this file). Matches machine.service.ts's established
  // always-scope-by-factory pattern; this is not a place to trust a raw id.
  private async validateMachineType(factoryId: string, machineId: string, expectedType: "cutting" | "polishing") {
    const machine = await this.prisma.machine.findFirst({ where: { id: machineId, factoryId } });
    if (!machine) {
      throw new BadRequestException(`Machine ${machineId} does not exist for this factory`);
    }
    if (machine.machineType !== expectedType) {
      throw new BadRequestException(`Machine ${machineId} is not a ${expectedType} machine`);
    }
  }

  // The ONLY way a block's status changes. Never PATCH currentStatus
  // directly — this keeps the transition log the single source of truth,
  // which is the whole point of the traceability design.
  async transition(factoryId: string, blockId: string, input: TransitionInput) {
    const block = await this.prisma.rawBlock.findFirstOrThrow({ where: { id: blockId, factoryId } });

    return this.prisma.$transaction([
      this.prisma.blockStateTransition.create({
        data: {
          rawBlockId: blockId,
          fromState: block.currentStatus,
          toState: input.toState,
          machineId: input.machineId,
          userId: input.userId,
          notes: input.notes,
        },
      }),
      this.prisma.rawBlock.update({
        where: { id: blockId },
        data: { currentStatus: input.toState },
      }),
    ]);
  }

  // Corrects an estimated figure once the real number is known — logs
  // the change instead of silently overwriting it, so the block's
  // history stays honest about what was a guess and when it was fixed.
  // Always requires elevated/accountant, regardless of which field is
  // being corrected — gated declaratively at the controller via @Roles().
  async reconcile(factoryId: string, rawBlockId: string, fieldName: string, newValue: number, user: AuthenticatedUser) {
    if (!RECONCILE_FIELDS.includes(fieldName as ReconcileField)) {
      throw new BadRequestException(`fieldName must be one of: ${RECONCILE_FIELDS.join(", ")}`);
    }
    if (typeof newValue !== "number" || Number.isNaN(newValue)) {
      throw new BadRequestException("newValue must be a number");
    }

    const block = await this.prisma.rawBlock.findFirstOrThrow({ where: { id: rawBlockId, factoryId } });
    const oldValue = (block as unknown as Record<string, unknown>)[fieldName];

    // This rule only ever applies to blocks that are currently "estimated" —
    // reconciling a field on a block that isn't estimated (e.g. an ordinary
    // "pending" purchase block awaiting its invoice) must leave costStatus
    // exactly as it was; it's not this endpoint's place to graduate it.
    // Within an "estimated" block: weight alone doesn't graduate it to
    // "confirmed" (cost may still be a guess); reconciling invoiced/actual
    // amount does, since those are the only figures cost_status describes.
    const costStatus =
      block.costStatus !== "estimated" ? block.costStatus : fieldName === "weightTons" ? "estimated" : "confirmed";

    return this.prisma.$transaction(async (tx) => {
      await tx.blockReconciliation.create({
        data: {
          rawBlockId,
          fieldName,
          oldValue: oldValue != null ? String(oldValue) : null,
          newValue: String(newValue),
          reconciledBy: user.id,
        },
      });

      return tx.rawBlock.update({
        where: { id: rawBlockId },
        data: {
          [fieldName]: newValue,
          costStatus,
          reconciledAt: new Date(),
          reconciledBy: user.id,
        },
      });
    });
  }
}
