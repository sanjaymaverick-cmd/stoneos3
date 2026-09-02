import { Injectable } from "@nestjs/common";
import { InventoryLocationType } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

// The nine places stock can sit, in the order it moves through the factory.
// Every factory gets exactly this set; codes are stable identifiers the rest
// of the app can look up by, names are what people see.
export const DEFAULT_LOCATIONS: Array<{ code: string; name: string; locationType: InventoryLocationType }> = [
  { code: "RAW_YARD", name: "Raw Yard", locationType: "RAW_YARD" },
  { code: "B21_QUEUE", name: "B-21 Queue", locationType: "B21_QUEUE" },
  { code: "B21_WIP", name: "B-21 In Progress", locationType: "B21_WIP" },
  { code: "UNPOLISHED_STOCK", name: "Unpolished Stock", locationType: "UNPOLISHED_STOCK" },
  { code: "LPM_QUEUE", name: "LPM Queue", locationType: "LPM_QUEUE" },
  { code: "LPM_WIP", name: "LPM In Progress", locationType: "LPM_WIP" },
  { code: "FINISHED_STOCK", name: "Finished Stock", locationType: "FINISHED_STOCK" },
  { code: "HOLD", name: "Hold", locationType: "HOLD" },
  { code: "DELIVERED", name: "Delivered", locationType: "DELIVERED" },
];

@Injectable()
export class InventoryLocationService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.inventoryLocation.findMany({
      where: { factoryId, active: true },
      orderBy: { code: "asc" },
    });
  }

  // Idempotent: safe to call on every factory, repeatedly. Relies on the
  // (factoryId, code) unique constraint rather than a read-then-write, so
  // two concurrent calls cannot produce duplicates.
  async ensureDefaults(factoryId: string) {
    await this.prisma.inventoryLocation.createMany({
      data: DEFAULT_LOCATIONS.map((l) => ({ ...l, factoryId })),
      skipDuplicates: true,
    });
    return this.findAll(factoryId);
  }

  // Resolve a stable code to this factory's row. Returns null rather than
  // throwing so callers can decide whether a missing location is an error.
  findByCode(factoryId: string, code: string) {
    return this.prisma.inventoryLocation.findFirst({ where: { factoryId, code } });
  }
}
