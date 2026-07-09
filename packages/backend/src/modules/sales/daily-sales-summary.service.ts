import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class DailySalesSummaryService {
  constructor(private prisma: PrismaService) {}

  findByDate(factoryId: string, from: string, to: string) {
    return this.prisma.dailySalesSummary.findMany({
      where: { factoryId, summaryDate: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { summaryDate: "asc" },
    });
  }

  // For the one-time historical backfill only — real daily totals from the
  // old cash-book, no variety detail available. isDerived stays false.
  backfill(factoryId: string, summaryDate: string, totalQtySqft: number, invoicedAmount: number, actualAmountReceived: number) {
    return this.prisma.dailySalesSummary.upsert({
      where: { factoryId_summaryDate: { factoryId, summaryDate: new Date(summaryDate) } },
      update: { totalQtySqft, invoicedAmount, actualAmountReceived, isDerived: false },
      create: { factoryId, summaryDate: new Date(summaryDate), totalQtySqft, invoicedAmount, actualAmountReceived, isDerived: false },
    });
  }

  // Going forward: recompute the day's summary from real sales_line_item
  // rows. Call this after every SalesOrderService.create() for that date.
  async recomputeFromLineItems(factoryId: string, summaryDate: string) {
    const dayStart = new Date(summaryDate);
    const dayEnd = new Date(summaryDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const orders = await this.prisma.salesOrder.findMany({
      where: { factoryId, orderDate: { gte: dayStart, lt: dayEnd } },
      include: { lineItems: true },
    });

    const lineItems = orders.flatMap((o) => o.lineItems);
    const totalQtySqft = lineItems.reduce((sum, li) => sum + Number(li.quantity), 0);
    const invoicedAmount = lineItems.reduce((sum, li) => sum + Number(li.invoicedAmount ?? 0), 0);
    const actualAmountReceived = lineItems.reduce((sum, li) => sum + Number(li.actualAmountReceived ?? 0), 0);

    return this.prisma.dailySalesSummary.upsert({
      where: { factoryId_summaryDate: { factoryId, summaryDate: dayStart } },
      update: { totalQtySqft, invoicedAmount, actualAmountReceived, isDerived: true },
      create: { factoryId, summaryDate: dayStart, totalQtySqft, invoicedAmount, actualAmountReceived, isDerived: true },
    });
  }
}
