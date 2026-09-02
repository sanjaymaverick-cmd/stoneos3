import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports liveness without touching the database", () => {
    const prisma = { $queryRaw: jest.fn() };
    expect(new HealthController(prisma as any).live()).toEqual({ status: "ok" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("reports readiness when PostgreSQL is reachable", async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) };
    await expect(new HealthController(prisma as any).ready()).resolves.toEqual({ status: "ok", database: "reachable" });
  });

  it("fails readiness without exposing database details", async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error("connection string secret")) };
    await expect(new HealthController(prisma as any).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(new HealthController(prisma as any).ready()).rejects.not.toThrow("connection string secret");
  });
});
