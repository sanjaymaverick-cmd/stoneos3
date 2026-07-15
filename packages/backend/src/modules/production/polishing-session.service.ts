import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

interface CreatePolishingSessionInput {
  machineId: string;
  operationalDate: string;
  stage: "grinding" | "polishing";
  finishType?: "glossy" | "leather"; // required when stage is "polishing", ignored otherwise
  slabIds: string[];
  runtimeHours?: number;
  powerConsumptionKwh?: number;
  downtimeMinutes?: number;
  downtimeReason?: string;
  notes?: string;
}

@Injectable()
export class PolishingSessionService {
  constructor(private prisma: PrismaService) {}

  findByDate(factoryId: string, operationalDate: string) {
    return this.prisma.polishingSession.findMany({
      where: { factoryId, operationalDate: new Date(operationalDate) },
      include: { slabs: { include: { slab: true } } },
    });
  }

  // One LPM run: records the session, links the specific slabs, sets each
  // slab's finish, and transitions each slab to 'polished' — all atomic.
  // The block→slab→finish trace never has gaps.
  async create(factoryId: string, userId: string, input: CreatePolishingSessionInput) {
    if (!input.slabIds?.length) {
      throw new BadRequestException("Polishing session needs at least one slab");
    }
    if (input.stage === "polishing" && !input.finishType) {
      throw new BadRequestException("Finish (glossy/leather) is required for a polishing-stage entry");
    }

    const slabs = await this.prisma.slab.findMany({
      where: { id: { in: input.slabIds }, factoryId },
    });
    if (slabs.length !== input.slabIds.length) {
      throw new BadRequestException("One or more slabs not found in this factory");
    }

    const isPolishingStage = input.stage === "polishing";

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.polishingSession.create({
        data: {
          factoryId,
          machineId: input.machineId,
          operationalDate: new Date(input.operationalDate),
          stage: input.stage,
          finishType: isPolishingStage ? input.finishType : undefined,
          slabsPolishedCount: input.slabIds.length,
          runtimeHours: input.runtimeHours,
          powerConsumptionKwh: input.powerConsumptionKwh,
          downtimeMinutes: input.downtimeMinutes,
          downtimeReason: input.downtimeReason,
          operatorId: userId,
          notes: input.notes,
        },
      });

      for (const slab of slabs) {
        await tx.polishingSessionSlab.create({
          data: { polishingSessionId: session.id, slabId: slab.id },
        });
        // Grinding is record-keeping only — the slab's real inventory state
        // (salesStatus) only advances to 'polished' once it actually goes
        // through the polishing stage.
        if (isPolishingStage) {
          await tx.slabStateTransition.create({
            data: { slabId: slab.id, fromState: slab.salesStatus, toState: "polished", machineId: input.machineId, userId },
          });
          await tx.slab.update({
            where: { id: slab.id },
            data: { salesStatus: "polished", finish: input.finishType },
          });
        }
      }

      return tx.polishingSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { slabs: { include: { slab: true } } },
      });
    });
  }
}
