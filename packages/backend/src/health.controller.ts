// Ported from the ston3gpt build (2026-09-02), unchanged.
//
//   GET /health       readiness — verifies PostgreSQL is actually reachable
//   GET /health/ready  same as above, explicit alias
//   GET /health/live   liveness — process only, never touches the database
//
// Readiness deliberately reports nothing about WHY the database is
// unreachable: the driver's error text can carry the connection string.
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./common/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get()
  ready() {
    return this.checkDatabase();
  }

  @Get("ready")
  readyAlias() {
    return this.checkDatabase();
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "reachable" };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable", database: "unreachable" });
    }
  }
}
