import { DprService } from "./dpr.service";

// Written against stoneos3's own DprService. ston3gpt's spec exercises a
// `derive()` method that builds the day's summary from cutting/polishing/
// machine/dispatch records, plus a guard rejecting management notes on the
// general production endpoint. Neither exists here — this service is the
// plain per-department upsert.
describe("DprService", () => {
  it("upserts on the factory + date + department unique constraint", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "dpr-a" });
    const service = new DprService({ dailyProductionReport: { upsert } } as any);

    await service.upsert("factory-a", { reportDate: "2026-07-12", department: "cutting", productionQty: 12 });

    expect(upsert.mock.calls[0][0].where).toEqual({
      factoryId_reportDate_department: {
        factoryId: "factory-a",
        reportDate: new Date("2026-07-12"),
        department: "cutting",
      },
    });
  });

  it("keeps reportDate and department out of the written fields", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new DprService({ dailyProductionReport: { upsert } } as any);

    await service.upsert("factory-a", { reportDate: "2026-07-12", department: "cutting", productionQty: 12 });

    const { update } = upsert.mock.calls[0][0];
    expect(update).toEqual({ productionQty: 12, isDerived: false });
    expect(update).not.toHaveProperty("reportDate");
    expect(update).not.toHaveProperty("department");
  });

  it("marks a hand-entered report as not derived on both branches", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new DprService({ dailyProductionReport: { upsert } } as any);

    await service.upsert("factory-a", { reportDate: "2026-07-12", department: "polishing" });

    const call = upsert.mock.calls[0][0];
    expect(call.update.isDerived).toBe(false);
    expect(call.create.isDerived).toBe(false);
  });

  it("scopes a date lookup to the caller's factory", () => {
    const findMany = jest.fn();
    new DprService({ dailyProductionReport: { findMany } } as any).findByDate("factory-a", "2026-07-12");

    expect(findMany).toHaveBeenCalledWith({
      where: { factoryId: "factory-a", reportDate: new Date("2026-07-12") },
    });
  });
});
