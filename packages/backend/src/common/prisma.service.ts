import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the whole backend. Every query that
// touches tenant data MUST filter by factoryId — see FactoryScopeGuard,
// which is what actually enforces this at the request layer.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
