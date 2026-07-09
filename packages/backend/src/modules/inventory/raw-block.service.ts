import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

interface CreateRawBlockInput {
  serialNumber: string;
  varietyName: string;
  supplierId?: string;
  weightTons?: number;
  purchaseDate?: string;
  invoicedAmount?: number;
  actualAmountPaid?: number;
  gstRate?: number;
}

interface TransitionInput {
  toState: string;
  machineId?: string;
  userId: string;
  notes?: string;
}

@Injectable()
export class RawBlockService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.rawBlock.findMany({
      where: { factoryId },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(factoryId: string, id: string) {
    return this.prisma.rawBlock.findFirst({
      where: { id, factoryId },
      include: { transitions: { orderBy: { occurredAt: "asc" } }, slabs: true },
    });
  }

  create(factoryId: string, input: CreateRawBlockInput) {
    return this.prisma.rawBlock.create({
      data: { factoryId, currentStatus: "in_stock", ...input },
    });
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
}
