import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { pickFields } from "../../common/pick-fields";

interface UpsertDprInput {
  reportDate: string;
  department: string;
  productionQty?: number;
  machineUtilisationPct?: number;
  recoveryPct?: number;
  rejectionPct?: number;
  reworkPct?: number;
  downtimeMinutes?: number;
  labourHours?: number;
  labourHeadcount?: number;
  rawBlockConsumption?: number;
  finishedSlabCount?: number;
  dispatchQty?: number;
  manualNotes?: string;
}

@Injectable()
export class DprService {
  constructor(private prisma: PrismaService) {}

  findByDate(factoryId: string, reportDate: string) {
    return this.prisma.dailyProductionReport.findMany({
      where: { factoryId, reportDate: new Date(reportDate) },
    });
  }

  // One row per (factory, date, department) — the DPR entry UI submits
  // one upsert call per department, matching the schema's unique constraint.
  // Runtime counterpart to UpsertDprInput above, which is erased at compile
  // time and enforced nothing. A QA run showed an operator setting the row's
  // own primary key through the body, and a foreign factoryId reaching the
  // INSERT. Neither is in this list, so neither survives now.
  private static readonly WRITABLE = [
    "productionQty",
    "machineUtilisationPct",
    "recoveryPct",
    "rejectionPct",
    "reworkPct",
    "downtimeMinutes",
    "labourHours",
    "labourHeadcount",
    "rawBlockConsumption",
    "finishedSlabCount",
    "dispatchQty",
    "manualNotes",
  ] as const;

  upsert(factoryId: string, input: UpsertDprInput) {
    const { reportDate, department } = input;
    const fields = pickFields<UpsertDprInput>(input, DprService.WRITABLE);
    return this.prisma.dailyProductionReport.upsert({
      where: {
        factoryId_reportDate_department: {
          factoryId,
          reportDate: new Date(reportDate),
          department,
        },
      },
      update: { ...fields, isDerived: false },
      create: { factoryId, reportDate: new Date(reportDate), department, ...fields, isDerived: false },
    });
  }
}
