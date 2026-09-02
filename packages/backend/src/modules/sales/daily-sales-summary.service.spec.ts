import { DailySalesSummaryService } from "./daily-sales-summary.service";

describe("DailySalesSummaryService", () => {
  it("marks a historical backfill as not derived", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "summary-a" });
    const service = new DailySalesSummaryService({ dailySalesSummary: { upsert } } as any);

    await service.backfill("factory-a", "2026-07-12", 100, 2000, 1500);

    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      factoryId_summaryDate: { factoryId: "factory-a", summaryDate: new Date("2026-07-12") },
    });
    expect(call.update).toMatchObject({ totalQtySqft: 100, invoicedAmount: 2000, isDerived: false });
    expect(call.create).toMatchObject({ factoryId: "factory-a", isDerived: false });
  });

  it("recomputes a day's totals from the line items of that day's orders", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "summary-a" });
    const prisma = {
      salesOrder: {
        findMany: jest.fn().mockResolvedValue([
          { lineItems: [{ quantity: 10, invoicedAmount: 100, actualAmountReceived: 90 }] },
          { lineItems: [{ quantity: 5, invoicedAmount: 50, actualAmountReceived: 50 }] },
        ]),
      },
      dailySalesSummary: { upsert },
    };
    const service = new DailySalesSummaryService(prisma as any);

    await service.recomputeFromLineItems("factory-a", "2026-07-12");

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      totalQtySqft: 15,
      invoicedAmount: 150,
      actualAmountReceived: 140,
      isDerived: true,
    });
  });

  it("treats missing amounts as zero rather than NaN", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      salesOrder: {
        findMany: jest.fn().mockResolvedValue([
          { lineItems: [{ quantity: 4, invoicedAmount: null, actualAmountReceived: undefined }] },
        ]),
      },
      dailySalesSummary: { upsert },
    };
    const service = new DailySalesSummaryService(prisma as any);

    await service.recomputeFromLineItems("factory-a", "2026-07-12");

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      totalQtySqft: 4,
      invoicedAmount: 0,
      actualAmountReceived: 0,
    });
  });

  it("queries a half-open one-day window so the next day never leaks in", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new DailySalesSummaryService({
      salesOrder: { findMany },
      dailySalesSummary: { upsert: jest.fn().mockResolvedValue({}) },
    } as any);

    await service.recomputeFromLineItems("factory-a", "2026-07-12");

    expect(findMany.mock.calls[0][0].where.orderDate).toEqual({
      gte: new Date("2026-07-12"),
      lt: new Date("2026-07-13"),
    });
  });
});
