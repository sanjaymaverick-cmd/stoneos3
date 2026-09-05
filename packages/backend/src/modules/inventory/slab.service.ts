import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { pickFields } from "../../common/pick-fields";

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

  // Runtime counterpart to CreateSlabInput above. A QA run showed a supervisor
  // creating slabs straight into `salesStatus: "sold"` with no transitions —
  // the sales flow and its audit trail simply skipped. salesStatus is
  // deliberately absent here: a new slab is always in_stock, and every move
  // out of that state goes through transition() so a trail exists.
  private static readonly OPTIONAL_WRITABLE = ["thicknessMm", "lengthFt", "widthFt", "finish"] as const;

  create(factoryId: string, input: CreateSlabInput) {
    // The three required fields are named explicitly so the compiler still
    // checks them; only the optional ones come through the allowlist. Nothing
    // the caller sends beyond these seven keys reaches the INSERT.
    const { parentBlockId, slabSerial, varietyName } = input;
    return this.prisma.slab.create({
      data: {
        factoryId,
        salesStatus: "in_stock",
        parentBlockId,
        slabSerial,
        varietyName,
        ...pickFields<CreateSlabInput>(input, SlabService.OPTIONAL_WRITABLE),
      },
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
