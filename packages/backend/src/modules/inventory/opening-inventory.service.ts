import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryKind, OwnershipType, Prisma, VerificationStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { InventoryLocationService } from "./inventory-location.service";
import { InventoryMovementService } from "./inventory-movement.service";

export interface StartCountInput {
  countDate: string;
}

export interface AddRawBlockInput {
  serialNumber: string;
  varietyName: string;
  weightTons?: number;
  openingValue?: number;
  locationCode?: string;
  ownershipType?: OwnershipType;
  verificationStatus?: VerificationStatus;
  notes?: string;
}

export interface AddSlabInput {
  slabSerial: string;
  varietyName: string;
  kind: "UNPOLISHED_SLAB" | "POLISHED_SLAB";
  lengthFt?: number;
  widthFt?: number;
  thicknessMm?: number;
  areaSqft?: number;
  openingValue?: number;
  locationCode?: string;
  ownershipType?: OwnershipType;
  verificationStatus?: VerificationStatus;
  notes?: string;
}

// Where each kind of counted stock lands if the caller does not say.
const DEFAULT_LOCATION_FOR: Record<InventoryKind, string> = {
  RAW_BLOCK: "RAW_YARD",
  UNPOLISHED_SLAB: "UNPOLISHED_STOCK",
  POLISHED_SLAB: "FINISHED_STOCK",
};

@Injectable()
export class OpeningInventoryService {
  constructor(
    private prisma: PrismaService,
    private locations: InventoryLocationService,
    private movements: InventoryMovementService,
  ) {}

  // Step 1 — start the count. Seeds the factory's locations at the same time,
  // since nothing can be placed before they exist.
  async start(factoryId: string, userId: string, input: StartCountInput) {
    const approved = await this.prisma.openingInventorySnapshot.findFirst({
      where: { factoryId, status: "APPROVED" },
    });
    if (approved) {
      throw new ConflictException("This factory already has an approved opening count.");
    }

    const open = await this.prisma.openingInventorySnapshot.findFirst({
      where: { factoryId, status: { in: ["DRAFT", "SUBMITTED"] } },
    });
    if (open) return this.findOne(factoryId, open.id);

    await this.locations.ensureDefaults(factoryId);

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.openingInventorySnapshot.create({
        data: { factoryId, countDate: new Date(input.countDate), createdBy: userId },
      });
      await tx.factory.update({
        where: { id: factoryId },
        data: { operatingStatus: "OPENING_COUNT_IN_PROGRESS" },
      });
      return created;
    });
    return this.findOne(factoryId, snapshot.id);
  }

  // Steps 2-4 — count raw blocks, then unpolished slabs, then finished slabs.
  // The item row is created here so the count has something real to point at;
  // it is deliberately NOT placed in a location yet. Placement happens only on
  // approval, so a draft count never affects live stock figures.
  async addRawBlock(factoryId: string, snapshotId: string, input: AddRawBlockInput) {
    const snapshot = await this.loadDraft(factoryId, snapshotId);
    const location = await this.resolveLocation(factoryId, input.locationCode ?? DEFAULT_LOCATION_FOR.RAW_BLOCK);

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.rawBlock.findFirst({
        where: { factoryId, serialNumber: input.serialNumber },
      });
      if (duplicate) {
        throw new ConflictException(`Block ${input.serialNumber} is already recorded.`);
      }

      const block = await tx.rawBlock.create({
        data: {
          factoryId,
          serialNumber: input.serialNumber,
          varietyName: input.varietyName,
          weightTons: input.weightTons,
          // An opening block was not bought through this system, and its cost
          // is an estimate until someone reconciles it against real paperwork.
          entrySource: "opening_balance",
          costStatus: "estimated",
          invoicedAmount: input.openingValue,
        },
      });

      return tx.openingInventoryLine.create({
        data: {
          snapshotId: snapshot.id,
          inventoryKind: "RAW_BLOCK",
          rawBlockId: block.id,
          locationId: location.id,
          openingValue: input.openingValue,
          ownershipType: input.ownershipType ?? "OWNED",
          verificationStatus: input.verificationStatus ?? "PHYSICALLY_COUNTED",
          notes: input.notes,
        },
        include: { rawBlock: true, location: true },
      });
    });
  }

  async addSlab(factoryId: string, snapshotId: string, input: AddSlabInput) {
    const snapshot = await this.loadDraft(factoryId, snapshotId);
    const location = await this.resolveLocation(
      factoryId,
      input.locationCode ?? DEFAULT_LOCATION_FOR[input.kind],
    );
    const areaSqft =
      input.areaSqft ?? (input.lengthFt && input.widthFt ? input.lengthFt * input.widthFt : undefined);

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.slab.findFirst({ where: { factoryId, slabSerial: input.slabSerial } });
      if (duplicate) {
        throw new ConflictException(`Slab ${input.slabSerial} is already recorded.`);
      }

      const slab = await tx.slab.create({
        data: {
          factoryId,
          slabSerial: input.slabSerial,
          varietyName: input.varietyName,
          lengthFt: input.lengthFt,
          widthFt: input.widthFt,
          thicknessMm: input.thicknessMm,
          salesStatus: "in_stock",
          // No parent block: an opening slab predates this system, so its
          // lineage genuinely is unknown rather than missing by mistake.
          finish: input.kind === "POLISHED_SLAB" ? "polished" : "unpolished",
        },
      });

      return tx.openingInventoryLine.create({
        data: {
          snapshotId: snapshot.id,
          inventoryKind: input.kind,
          slabId: slab.id,
          locationId: location.id,
          areaSqft,
          openingValue: input.openingValue,
          ownershipType: input.ownershipType ?? "OWNED",
          verificationStatus: input.verificationStatus ?? "PHYSICALLY_COUNTED",
          notes: input.notes,
        },
        include: { slab: true, location: true },
      });
    });
  }

  async removeLine(factoryId: string, snapshotId: string, lineId: string) {
    await this.loadDraft(factoryId, snapshotId);

    return this.prisma.$transaction(async (tx) => {
      const line = await tx.openingInventoryLine.findFirst({ where: { id: lineId, snapshotId } });
      if (!line) throw new NotFoundException("Count line not found");

      await tx.openingInventoryLine.delete({ where: { id: lineId } });
      // The item row was created by this line, and nothing has been placed
      // yet, so removing the line removes the item too.
      if (line.rawBlockId) await tx.rawBlock.delete({ where: { id: line.rawBlockId } });
      if (line.slabId) await tx.slab.delete({ where: { id: line.slabId } });
      return { removed: lineId };
    });
  }

  // Step 5 — review, then submit for approval.
  async submit(factoryId: string, snapshotId: string, userId: string) {
    const snapshot = await this.loadDraft(factoryId, snapshotId);
    const lineCount = await this.prisma.openingInventoryLine.count({ where: { snapshotId } });
    if (lineCount === 0) {
      throw new BadRequestException("Count nothing and there is nothing to approve — add at least one item.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.openingInventorySnapshot.update({
        where: { id: snapshot.id },
        data: { status: "SUBMITTED", submittedBy: userId, submittedAt: new Date() },
      });
      await tx.factory.update({
        where: { id: factoryId },
        data: { operatingStatus: "OPENING_PENDING_APPROVAL" },
      });
    });
    return this.findOne(factoryId, snapshotId);
  }

  // Approval is the moment the factory's books start. In ONE transaction it
  // places every counted item in its location, writes an OPENING_RECEIPT
  // movement for each, and flips the factory to LIVE — so the factory can
  // never be live with stock that was never placed, or vice versa.
  async approve(factoryId: string, snapshotId: string, userId: string) {
    const snapshot = await this.prisma.openingInventorySnapshot.findFirst({
      where: { id: snapshotId, factoryId },
      include: { lines: true },
    });
    if (!snapshot) throw new NotFoundException("Opening count not found");
    if (snapshot.status !== "SUBMITTED") {
      throw new BadRequestException(`Only a submitted count can be approved (this one is ${snapshot.status}).`);
    }
    if (snapshot.createdBy === userId) {
      throw new BadRequestException("An opening count must be approved by someone other than the person who counted it.");
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of snapshot.lines) {
        if (line.rawBlockId) {
          await tx.rawBlock.update({ where: { id: line.rawBlockId }, data: { locationId: line.locationId } });
        } else if (line.slabId) {
          await tx.slab.update({ where: { id: line.slabId }, data: { locationId: line.locationId } });
        }

        await this.movements.recordIn(tx, factoryId, userId, {
          movementType: "OPENING_RECEIPT",
          rawBlockId: line.rawBlockId ?? undefined,
          slabId: line.slabId ?? undefined,
          toLocationId: line.locationId,
          areaSqft: line.areaSqft ? Number(line.areaSqft) : undefined,
          referenceType: "opening_inventory_line",
          referenceId: line.id,
          // Derived from the line id, so re-running approval cannot post a
          // second receipt for the same counted item.
          idempotencyKey: `opening:${line.id}`,
        });
      }

      await tx.openingInventorySnapshot.update({
        where: { id: snapshot.id },
        data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
      });
      await tx.factory.update({ where: { id: factoryId }, data: { operatingStatus: "LIVE" } });
    });

    return this.findOne(factoryId, snapshotId);
  }

  async reject(factoryId: string, snapshotId: string, userId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException("A rejection must carry a reason");

    const snapshot = await this.prisma.openingInventorySnapshot.findFirst({
      where: { id: snapshotId, factoryId },
    });
    if (!snapshot) throw new NotFoundException("Opening count not found");
    if (snapshot.status !== "SUBMITTED") {
      throw new BadRequestException(`Only a submitted count can be rejected (this one is ${snapshot.status}).`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.openingInventorySnapshot.update({
        where: { id: snapshot.id },
        data: { status: "REJECTED", rejectedBy: userId, rejectedAt: new Date(), rejectionReason: reason },
      });
      // Back to counting, not stuck pending — a rejected count is reworked.
      await tx.factory.update({
        where: { id: factoryId },
        data: { operatingStatus: "OPENING_COUNT_IN_PROGRESS" },
      });
    });
    return this.findOne(factoryId, snapshotId);
  }

  async findCurrent(factoryId: string) {
    const snapshot = await this.prisma.openingInventorySnapshot.findFirst({
      where: { factoryId },
      orderBy: { createdAt: "desc" },
    });
    if (!snapshot) return null;
    return this.findOne(factoryId, snapshot.id);
  }

  // The review step's data: every line plus per-kind totals.
  async findOne(factoryId: string, snapshotId: string) {
    const snapshot = await this.prisma.openingInventorySnapshot.findFirst({
      where: { id: snapshotId, factoryId },
      include: {
        lines: {
          include: { rawBlock: true, slab: true, location: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!snapshot) throw new NotFoundException("Opening count not found");

    const summarise = (kind: InventoryKind) => {
      const lines = snapshot.lines.filter((l) => l.inventoryKind === kind);
      return {
        count: lines.length,
        areaSqft: lines.reduce((sum, l) => sum + Number(l.areaSqft ?? 0), 0),
        openingValue: lines.reduce((sum, l) => sum + Number(l.openingValue ?? 0), 0),
      };
    };

    return {
      ...snapshot,
      totals: {
        rawBlocks: summarise("RAW_BLOCK"),
        unpolishedSlabs: summarise("UNPOLISHED_SLAB"),
        polishedSlabs: summarise("POLISHED_SLAB"),
        openingValue: snapshot.lines.reduce((sum, l) => sum + Number(l.openingValue ?? 0), 0),
      },
    };
  }

  private async loadDraft(factoryId: string, snapshotId: string) {
    const snapshot = await this.prisma.openingInventorySnapshot.findFirst({
      where: { id: snapshotId, factoryId },
    });
    if (!snapshot) throw new NotFoundException("Opening count not found");
    if (snapshot.status !== "DRAFT") {
      throw new BadRequestException(`This count is ${snapshot.status} and can no longer be edited.`);
    }
    return snapshot;
  }

  private async resolveLocation(factoryId: string, code: string) {
    const location = await this.locations.findByCode(factoryId, code);
    if (!location) {
      throw new BadRequestException(`Unknown location "${code}" for this factory.`);
    }
    return location;
  }
}
