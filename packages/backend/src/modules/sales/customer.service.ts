import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.customer.findMany({ where: { factoryId }, orderBy: { name: "asc" } });
  }

  create(factoryId: string, name: string, contactInfo?: string, creditLimit?: number) {
    return this.prisma.customer.create({ data: { factoryId, name, contactInfo, creditLimit } });
  }
}
