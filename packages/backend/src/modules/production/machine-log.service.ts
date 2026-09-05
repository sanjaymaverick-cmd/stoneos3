import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { pickFields } from "../../common/pick-fields";

@Injectable()
export class MachineLogService {
  constructor(private prisma: PrismaService) {}

  // machineId + logDate is the unique constraint — same upsert pattern as DPR.
  //
  // machineId arrives from the URL, so it MUST be confirmed to belong to the
  // caller's factory before anything is written; without this a caller could
  // post runtime against another factory's machine. machine_runtime_log has no
  // factory_id of its own, so this lookup is the only tenant boundary here.
  // machineId is NOT writable here on purpose. A QA run posted a log to
  // B-21's URL with a body naming LPM, and it was written against LPM — the
  // ownership check below ran on the URL id and was then thrown away by the
  // spread. Keeping machineId out of this list is what makes that check mean
  // something.
  private static readonly WRITABLE = [
    "runtimeMinutes",
    "downtimeMinutes",
    "downtimeReason",
    "operatorId",
    "powerConsumptionKwh",
    "bladeOrHeadUsage",
  ] as const;

  async upsert(factoryId: string, machineId: string, logDate: string, body: Record<string, unknown>) {
    const machine = await this.prisma.machine.findFirst({
      where: { id: machineId, factoryId },
      select: { id: true },
    });
    if (!machine) throw new NotFoundException("Machine not found");

    const fields = pickFields(body, MachineLogService.WRITABLE);
    return this.prisma.machineRuntimeLog.upsert({
      where: { machineId_logDate: { machineId, logDate: new Date(logDate) } },
      update: fields,
      create: { machineId, logDate: new Date(logDate), ...fields },
    });
  }
}
