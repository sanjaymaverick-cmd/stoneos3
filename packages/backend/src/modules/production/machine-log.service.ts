import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class MachineLogService {
  constructor(private prisma: PrismaService) {}

  // machineId + logDate is the unique constraint — same upsert pattern as DPR.
  //
  // machineId arrives from the URL, so it MUST be confirmed to belong to the
  // caller's factory before anything is written; without this a caller could
  // post runtime against another factory's machine. machine_runtime_log has no
  // factory_id of its own, so this lookup is the only tenant boundary here.
  async upsert(factoryId: string, machineId: string, logDate: string, fields: Record<string, unknown>) {
    const machine = await this.prisma.machine.findFirst({
      where: { id: machineId, factoryId },
      select: { id: true },
    });
    if (!machine) throw new NotFoundException("Machine not found");

    return this.prisma.machineRuntimeLog.upsert({
      where: { machineId_logDate: { machineId, logDate: new Date(logDate) } },
      update: fields,
      create: { machineId, logDate: new Date(logDate), ...fields },
    });
  }
}
