import { NotFoundException } from "@nestjs/common";
import { MachineLogService } from "./machine-log.service";

describe("MachineLogService", () => {
  it("rejects a log for a machine outside the caller's factory", async () => {
    const prisma = {
      machine: { findFirst: jest.fn().mockResolvedValue(null) },
      machineRuntimeLog: { upsert: jest.fn() },
    };
    const service = new MachineLogService(prisma as any);

    await expect(service.upsert("factory-a", "machine-b", "2026-07-12", { runtimeMinutes: 120 })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.machine.findFirst).toHaveBeenCalledWith({
      where: { id: "machine-b", factoryId: "factory-a" },
      select: { id: true },
    });
    // The tenant check must gate the write, not merely accompany it.
    expect(prisma.machineRuntimeLog.upsert).not.toHaveBeenCalled();
  });

  it("upserts on the machineId + logDate unique constraint once tenancy is confirmed", async () => {
    const prisma = {
      machine: { findFirst: jest.fn().mockResolvedValue({ id: "machine-a" }) },
      machineRuntimeLog: { upsert: jest.fn().mockResolvedValue({ id: "log-a" }) },
    };
    const service = new MachineLogService(prisma as any);

    await expect(service.upsert("factory-a", "machine-a", "2026-07-12", { runtimeMinutes: 120 })).resolves.toEqual({
      id: "log-a",
    });
    expect(prisma.machineRuntimeLog.upsert).toHaveBeenCalledWith({
      where: { machineId_logDate: { machineId: "machine-a", logDate: new Date("2026-07-12") } },
      update: { runtimeMinutes: 120 },
      create: { machineId: "machine-a", logDate: new Date("2026-07-12"), runtimeMinutes: 120 },
    });
  });

  it("carries every supplied field into both the update and create branches", async () => {
    const prisma = {
      machine: { findFirst: jest.fn().mockResolvedValue({ id: "machine-a" }) },
      machineRuntimeLog: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new MachineLogService(prisma as any);

    await service.upsert("factory-a", "machine-a", "2026-07-12", { runtimeMinutes: 90, downtimeMinutes: 15 });

    const call = prisma.machineRuntimeLog.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ runtimeMinutes: 90, downtimeMinutes: 15 });
    expect(call.create).toMatchObject({ runtimeMinutes: 90, downtimeMinutes: 15 });
  });
});
