import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

export interface RecordMovementInput {
  movementType: InventoryMovementType;
  rawBlockId?: string;
  slabId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity?: number;
  areaSqft?: number;
  referenceType: string;
  referenceId: string;
  reason?: string;
  // Caller-supplied, unique per factory. A retried request reusing the same
  // key returns the original row instead of posting a second movement.
  idempotencyKey: string;
}

@Injectable()
export class InventoryMovementService {
  constructor(private prisma: PrismaService) {}

  // Append one movement. The database also enforces every rule checked here
  // (see the CHECK constraints in 20260902000000_inventory_ledger) — these
  // checks exist to return a useful message rather than a raw constraint
  // violation, not as the only line of defence.
  async record(factoryId: string, createdBy: string, input: RecordMovementInput) {
    return this.prisma.$transaction((tx) => this.recordIn(tx, factoryId, createdBy, input));
  }

  // Same as record(), but joins a transaction the caller already opened, so a
  // movement can be written atomically with the state change it describes.
  async recordIn(
    tx: Prisma.TransactionClient,
    factoryId: string,
    createdBy: string,
    input: RecordMovementInput,
  ) {
    const hasBlock = Boolean(input.rawBlockId);
    const hasSlab = Boolean(input.slabId);
    if (hasBlock === hasSlab) {
      throw new BadRequestException("A movement must name exactly one of rawBlockId or slabId");
    }
    if (!input.fromLocationId && !input.toLocationId) {
      throw new BadRequestException("A movement needs at least one of fromLocationId or toLocationId");
    }
    const quantity = input.quantity ?? 1;
    if (!(quantity > 0)) {
      throw new BadRequestException("quantity must be greater than zero");
    }
    if (input.areaSqft !== undefined && !(input.areaSqft > 0)) {
      throw new BadRequestException("areaSqft must be greater than zero when supplied");
    }
    if (input.movementType === "REVERSAL") {
      throw new BadRequestException("Use reverse() to post a REVERSAL so it is linked to its original");
    }

    // A retry with the same key is not an error — hand back what was already
    // written so the caller sees a consistent result either way.
    const existing = await tx.inventoryMovement.findFirst({
      where: { factoryId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    await this.assertSubjectAndLocationsBelongToFactory(tx, factoryId, input);

    return tx.inventoryMovement.create({
      data: {
        factoryId,
        movementType: input.movementType,
        rawBlockId: input.rawBlockId ?? null,
        slabId: input.slabId ?? null,
        fromLocationId: input.fromLocationId ?? null,
        toLocationId: input.toLocationId ?? null,
        quantity,
        areaSqft: input.areaSqft ?? null,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason ?? null,
        createdBy,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  // Correct a mistake by appending a REVERSAL that mirrors the original's
  // subject with its locations swapped. The original is never touched — that
  // is the point of an append-only ledger.
  async reverse(factoryId: string, createdBy: string, movementId: string, reason: string, idempotencyKey: string) {
    if (!reason?.trim()) {
      throw new BadRequestException("A reversal must carry a reason");
    }

    return this.prisma.$transaction(async (tx) => {
      const original = await tx.inventoryMovement.findFirst({ where: { id: movementId, factoryId } });
      if (!original) throw new NotFoundException("Movement not found");
      if (original.movementType === "REVERSAL") {
        throw new BadRequestException("A reversal cannot itself be reversed");
      }

      const already = await tx.inventoryMovement.findFirst({
        where: { factoryId, reversesMovementId: movementId },
      });
      if (already) throw new BadRequestException("This movement has already been reversed");

      const existing = await tx.inventoryMovement.findFirst({ where: { factoryId, idempotencyKey } });
      if (existing) return existing;

      return tx.inventoryMovement.create({
        data: {
          factoryId,
          movementType: "REVERSAL",
          rawBlockId: original.rawBlockId,
          slabId: original.slabId,
          // Swapped: undoing a move into a location is a move back out of it.
          fromLocationId: original.toLocationId,
          toLocationId: original.fromLocationId,
          quantity: original.quantity,
          areaSqft: original.areaSqft,
          referenceType: "reversal",
          referenceId: original.id,
          reversesMovementId: original.id,
          reason,
          createdBy,
          idempotencyKey,
        },
      });
    });
  }

  // Full movement history for one item, oldest first — this is the audit
  // trail a person reads to answer "where has this block been?".
  history(factoryId: string, params: { rawBlockId?: string; slabId?: string }) {
    if (!params.rawBlockId && !params.slabId) {
      throw new BadRequestException("Provide either rawBlockId or slabId");
    }
    return this.prisma.inventoryMovement.findMany({
      where: {
        factoryId,
        ...(params.rawBlockId ? { rawBlockId: params.rawBlockId } : {}),
        ...(params.slabId ? { slabId: params.slabId } : {}),
      },
      include: { fromLocation: true, toLocation: true },
      orderBy: { occurredAt: "asc" },
    });
  }

  // What is standing in each location right now, counted from the item tables
  // rather than by replaying the ledger — the ledger explains how stock got
  // where it is; raw_block.location_id / slab.location_id say where it is.
  async onHandByLocation(factoryId: string) {
    const locations = await this.prisma.inventoryLocation.findMany({
      where: { factoryId, active: true },
      orderBy: { code: "asc" },
    });
    const [blocks, slabs] = await Promise.all([
      this.prisma.rawBlock.groupBy({ by: ["locationId"], where: { factoryId }, _count: { _all: true } }),
      this.prisma.slab.groupBy({ by: ["locationId"], where: { factoryId }, _count: { _all: true } }),
    ]);
    const countFor = (rows: Array<{ locationId: string | null; _count: { _all: number } }>, id: string) =>
      rows.find((r) => r.locationId === id)?._count._all ?? 0;

    return locations.map((location) => ({
      location,
      rawBlocks: countFor(blocks as any, location.id),
      slabs: countFor(slabs as any, location.id),
    }));
  }

  private async assertSubjectAndLocationsBelongToFactory(
    tx: Prisma.TransactionClient,
    factoryId: string,
    input: RecordMovementInput,
  ) {
    if (input.rawBlockId) {
      const block = await tx.rawBlock.findFirst({
        where: { id: input.rawBlockId, factoryId },
        select: { id: true },
      });
      if (!block) throw new NotFoundException("Raw block not found in this factory");
    }
    if (input.slabId) {
      const slab = await tx.slab.findFirst({ where: { id: input.slabId, factoryId }, select: { id: true } });
      if (!slab) throw new NotFoundException("Slab not found in this factory");
    }

    // inventory_movement has its own factory_id, but the location FKs do not
    // constrain the factory — without this a movement could point at another
    // tenant's location.
    const locationIds = [input.fromLocationId, input.toLocationId].filter(Boolean) as string[];
    if (locationIds.length > 0) {
      const owned = await tx.inventoryLocation.findMany({
        where: { id: { in: locationIds }, factoryId },
        select: { id: true },
      });
      if (owned.length !== new Set(locationIds).size) {
        throw new BadRequestException("One or more locations do not belong to this factory");
      }
    }
  }
}
