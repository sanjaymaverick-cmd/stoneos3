import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

// Lives here rather than its own module for now since its only consumer
// is expense tracking (category = 'vehicle'). Split out if it grows
// maintenance/fuel-log features of its own.
@Injectable()
export class VehicleService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.vehicle.findMany({ where: { factoryId }, orderBy: { active: "desc" } });
  }

  create(factoryId: string, name: string, vehicleType?: string, purchaseDate?: string) {
    return this.prisma.vehicle.create({
      data: { factoryId, name, vehicleType, purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined },
    });
  }

  retire(factoryId: string, id: string, retiredDate: string) {
    return this.prisma.vehicle.updateMany({
      where: { id, factoryId },
      data: { active: false, retiredDate: new Date(retiredDate) },
    });
  }
}
