import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class MachineLogService {
  constructor(private prisma: PrismaService) {}

  // machineId + logDate is the unique constraint — same upsert pattern as DPR.
  upsert(machineId: string, logDate: string, fields: Record<string, unknown>) {
    return this.prisma.machineRuntimeLog.upsert({
      where: { machineId_logDate: { machineId, logDate: new Date(logDate) } },
      update: fields,
      create: { machineId, logDate: new Date(logDate), ...fields },
    });
  }
}
