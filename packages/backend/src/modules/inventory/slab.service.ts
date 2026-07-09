import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

interface CreateSlabInput {
  parentBlockId: string;
  slabSerial: string;
  varietyName: string;
  thicknessMm?: number;
  lengthFt?: number;
  widthFt?: number;
  finish?: string;
}

@Injectable()
export class SlabService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.slab.findMany({ where: { factoryId }, orderBy: { createdAt: "desc" } });
  }

  findOne(factoryId: string, id: string) {
    return this.prisma.slab.findFirst({
      where: { id, factoryId },
      include: { transitions: { orderBy: { occurredAt: "asc" } }, parentBlock: true },
    });
  }

  create(factoryId: string, input: CreateSlabInput) {
    return this.prisma.slab.create({
      data: { factoryId, salesStatus: "in_stock", ...input },
    });
  }

  async transition(factoryId: string, slabId: string, toState: string, userId: string, machineId?: string, notes?: string) {
    const slab = await this.prisma.slab.findFirstOrThrow({ where: { id: slabId, factoryId } });

    return this.prisma.$transaction([
      this.prisma.slabStateTransition.create({
        data: { slabId, fromState: slab.salesStatus, toState, machineId, userId, notes },
      }),
      this.prisma.slab.update({ where: { id: slabId }, data: { salesStatus: toState } }),
    ]);
  }
}
