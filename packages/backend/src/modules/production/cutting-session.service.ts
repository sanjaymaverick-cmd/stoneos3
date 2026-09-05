import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { pickFields } from "../../common/pick-fields";

// OPERATIONAL DAY = 7am to 7am. Work done at 2am on Jan 6 belongs to
// operational date Jan 5 (the 7am report that covers it). This helper is
// the single place that rule lives — reuse it anywhere daily rollups are
// computed so app numbers always match the factory's 7am reports.
export function operationalDateFor(timestamp: Date): Date {
  const d = new Date(timestamp);
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface StartSessionInput {
  rawBlockId: string;
  machineId: string;
  startedAt?: string;
  expectedSlabCount?: number; // OPTIONAL pre-estimate for planning only —
                              // the real numbers come in at completion now
}

interface DayLogInput {
  operationalDate: string;
  runtimeHours?: number;
  powerCutMinutes?: number;
  downtimeMinutes?: number;
  downtimeReason?: string;
  powerConsumptionKwh?: number;
  slabsProducedCount?: number;
  notes?: string;
}

interface CompleteSessionInput {
  endedAt?: string;
  totalSlabsCut: number;       // actual physical count off the saw, including damaged
  finalGoodSlabCount: number;  // after inspection — this many become real Slab rows
  // 99% of the time all slabs from one block are the same size — enter once here.
  lengthFt?: number;
  widthFt?: number;
  thicknessMm?: number;
  // Opt-in escape hatch for the rare mixed-size batch — a few slabs came out a
  // different size. `sequence` matches the generation loop's 1-based `seq` (same
  // numbering used to build slabSerial). Any of the three left unset on a given
  // override falls back to the session-level default above.
  slabOverrides?: { sequence: number; lengthFt?: number; widthFt?: number; thicknessMm?: number }[];
  wastageNotes?: string;
}

@Injectable()
export class CuttingSessionService {
  constructor(private prisma: PrismaService) {}

  findActive(factoryId: string) {
    return this.prisma.cuttingSession.findMany({
      where: { factoryId, status: "in_progress" },
      include: { rawBlock: true, dayLogs: { orderBy: { operationalDate: "asc" } } },
    });
  }

  findAll(factoryId: string) {
    return this.prisma.cuttingSession.findMany({
      where: { factoryId },
      include: { rawBlock: true, dayLogs: true, registeredSlabs: true },
      orderBy: { startedAt: "desc" },
    });
  }

  // Allocating a block to B-21: starts the session AND transitions the
  // block to 'under_cutting' in the same transaction — the state machine
  // and the session record can never disagree.
  async start(factoryId: string, userId: string, input: StartSessionInput) {
    const block = await this.prisma.rawBlock.findFirstOrThrow({
      where: { id: input.rawBlockId, factoryId },
    });
    if (block.currentStatus !== "in_stock") {
      throw new BadRequestException(`Block ${block.serialNumber} is '${block.currentStatus}', not in stock`);
    }
    const existing = await this.prisma.cuttingSession.findFirst({
      where: { rawBlockId: input.rawBlockId, status: "in_progress" },
    });
    if (existing) {
      throw new BadRequestException(`Block ${block.serialNumber} already has an active cutting session`);
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.cuttingSession.create({
        data: {
          factoryId,
          rawBlockId: input.rawBlockId,
          machineId: input.machineId,
          startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
          expectedSlabCount: input.expectedSlabCount,
        },
      });
      await tx.blockStateTransition.create({
        data: { rawBlockId: input.rawBlockId, fromState: block.currentStatus, toState: "under_cutting", machineId: input.machineId, userId },
      });
      await tx.rawBlock.update({ where: { id: input.rawBlockId }, data: { currentStatus: "under_cutting" } });
      return session;
    });
  }

  // Runtime counterpart to DayLogInput. cuttingSessionId is absent on purpose:
  // a QA run posted a day-log to session A's URL with session B's id in the
  // body, and it landed on B.
  private static readonly DAY_LOG_WRITABLE = [
    "runtimeHours",
    "powerCutMinutes",
    "downtimeMinutes",
    "downtimeReason",
    "powerConsumptionKwh",
    "slabsProducedCount",
    "notes",
  ] as const;

  // One row per operational day per session. Upsert so the 7am entry can
  // be corrected during the day without duplicating.
  //
  // factoryId is required and checked. Until this took it, the method never
  // received one at all — the only endpoint in the app with no tenant check
  // whatsoever. An unknown session id reached Postgres and surfaced as a raw
  // 500 foreign-key violation rather than a 404, which is how the gap was
  // spotted: the sibling complete() looks its session up, this did not.
  async upsertDayLog(factoryId: string, sessionId: string, userId: string, input: DayLogInput) {
    const session = await this.prisma.cuttingSession.findFirst({
      where: { id: sessionId, factoryId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException("Cutting session not found");

    const { operationalDate } = input;
    const fields = pickFields<DayLogInput>(input, CuttingSessionService.DAY_LOG_WRITABLE);
    return this.prisma.cuttingDayLog.upsert({
      where: {
        cuttingSessionId_operationalDate: {
          cuttingSessionId: sessionId,
          operationalDate: new Date(operationalDate),
        },
      },
      update: { ...fields, operatorId: userId },
      create: { cuttingSessionId: sessionId, operationalDate: new Date(operationalDate), ...fields, operatorId: userId },
    });
  }

  // Completing a session is now the ONE step that both closes out the
  // block AND generates all slab serials at once — no more tapping
  // through each slab individually. The supervisor enters two numbers
  // (total cut, final good) after inspecting the batch; the difference
  // is damaged/broken and never becomes a Slab row — it's real material
  // loss, but it's tracked as damagedSlabCount for cost purposes, not as
  // sellable inventory.
  //
  // Serial format: {blockSerial}/{totalSlabsCut}/{sequence}, e.g.
  // V101/50/01..V101/50/47 for 47 good slabs out of 50 cut — the
  // denominator stays the true physical yield even though only 47 rows
  // get created, so the wastage rate stays visible in the serial itself.
  async complete(factoryId: string, userId: string, sessionId: string, input: CompleteSessionInput) {
    if (input.finalGoodSlabCount > input.totalSlabsCut) {
      throw new BadRequestException("finalGoodSlabCount cannot exceed totalSlabsCut");
    }

    // Rare mixed-size batch: a few slabs came out a different size than the
    // session default. Validate up front, before touching the DB, so a bad
    // request never partially applies.
    const overridesBySeq = new Map<number, NonNullable<CompleteSessionInput["slabOverrides"]>[number]>();
    if (input.slabOverrides && input.slabOverrides.length > 0) {
      const seenSequences = new Set<number>();
      for (const override of input.slabOverrides) {
        if (!Number.isInteger(override.sequence) || override.sequence < 1 || override.sequence > input.finalGoodSlabCount) {
          throw new BadRequestException(
            `slabOverrides sequence ${override.sequence} must be an integer between 1 and ${input.finalGoodSlabCount}`,
          );
        }
        if (seenSequences.has(override.sequence)) {
          throw new BadRequestException(`slabOverrides sequence ${override.sequence} is duplicated`);
        }
        seenSequences.add(override.sequence);
        overridesBySeq.set(override.sequence, override);
      }
    }

    const session = await this.prisma.cuttingSession.findFirstOrThrow({
      where: { id: sessionId, factoryId },
      include: { rawBlock: true },
    });
    if (session.status !== "in_progress") {
      throw new BadRequestException("Session is not in progress");
    }

    const damagedSlabCount = input.totalSlabsCut - input.finalGoodSlabCount;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cuttingSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          endedAt: input.endedAt ? new Date(input.endedAt) : new Date(),
          totalSlabsCut: input.totalSlabsCut,
          finalGoodSlabCount: input.finalGoodSlabCount,
          damagedSlabCount,
          wastageNotes: input.wastageNotes,
        },
      });

      await tx.blockStateTransition.create({
        data: { rawBlockId: session.rawBlockId, fromState: session.rawBlock.currentStatus, toState: "cut", machineId: session.machineId, userId },
      });
      await tx.rawBlock.update({ where: { id: session.rawBlockId }, data: { currentStatus: "cut" } });

      // Bulk-generate the good slabs only. Damaged ones are represented
      // solely by damagedSlabCount above — deliberately no Slab row, no
      // inventory, no sales_status. If cost allocation later wants to
      // book the loss, it should reference raw_block cost (see
      // expense_allocation), never a finished slab price — this material
      // never received polishing/finishing value.
      const createdSlabs = [];
      for (let seq = 1; seq <= input.finalGoodSlabCount; seq++) {
        const slabSerial = `${session.rawBlock.serialNumber}/${input.totalSlabsCut}/${String(seq).padStart(2, "0")}`;
        const override = overridesBySeq.get(seq);
        const slab = await tx.slab.create({
          data: {
            factoryId,
            parentBlockId: session.rawBlockId,
            cuttingSessionId: session.id,
            slabSerial,
            varietyName: session.rawBlock.varietyName,
            lengthFt: override?.lengthFt ?? input.lengthFt,
            widthFt: override?.widthFt ?? input.widthFt,
            thicknessMm: override?.thicknessMm ?? input.thicknessMm ?? 18.0,
          },
        });
        createdSlabs.push(slab);
      }

      return { session: updated, damagedSlabCount, createdSlabs };
    });
  }
}
