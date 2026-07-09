import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

interface CreateMachineInput {
  name: string;
  machineType: "cutting" | "polishing";
  bladeCount?: number;      // B-21
  headCount?: number;       // LPM
  abrasivesPerHead?: number; // LPM — defaults to 6, your standard
  installedDate?: string;
}

@Injectable()
export class MachineService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.machine.findMany({ where: { factoryId }, orderBy: { name: "asc" } });
  }

  create(factoryId: string, input: CreateMachineInput) {
    return this.prisma.machine.create({
      data: {
        factoryId,
        name: input.name,
        machineType: input.machineType,
        bladeCount: input.bladeCount,
        headCount: input.headCount,
        abrasivesPerHead: input.machineType === "polishing" ? (input.abrasivesPerHead ?? 6) : undefined,
        installedDate: input.installedDate ? new Date(input.installedDate) : undefined,
      },
    });
  }
}
