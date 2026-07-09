import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

interface SalesLineItemInput {
  slabId?: string;
  varietyName: string;
  quantity: number;
  unitPrice: number;
  gstAmount?: number;
  loadingCharge?: number;
  transportCharge?: number;
  invoicedAmount?: number;
  actualAmountReceived?: number;
  paymentType: "invoiced" | "cash" | "mixed";
}

interface CreateSalesOrderInput {
  customerId: string;
  orderDate: string;
  lineItems: SalesLineItemInput[];
}

@Injectable()
export class SalesOrderService {
  constructor(private prisma: PrismaService) {}

  findAll(factoryId: string) {
    return this.prisma.salesOrder.findMany({
      where: { factoryId },
      include: { lineItems: true, customer: true },
      orderBy: { orderDate: "desc" },
    });
  }

  findOne(factoryId: string, id: string) {
    return this.prisma.salesOrder.findFirst({
      where: { id, factoryId },
      include: { lineItems: true, customer: true, invoice: true },
    });
  }

  // Creates the order and all line items atomically, and — where a line
  // item references a real slab — moves that slab to 'sold'. If any part
  // fails, nothing is written; we never want a half-recorded sale.
  async create(factoryId: string, userId: string, input: CreateSalesOrderInput) {
    if (!input.lineItems?.length) {
      throw new BadRequestException("Sales order needs at least one line item");
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.create({
        data: {
          factoryId,
          customerId: input.customerId,
          orderDate: new Date(input.orderDate),
        },
      });

      for (const item of input.lineItems) {
        await tx.salesLineItem.create({
          data: {
            salesOrderId: order.id,
            slabId: item.slabId,
            varietyName: item.varietyName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            gstAmount: item.gstAmount ?? 0,
            loadingCharge: item.loadingCharge ?? 0,
            transportCharge: item.transportCharge ?? 0,
            invoicedAmount: item.invoicedAmount,
            actualAmountReceived: item.actualAmountReceived,
            paymentType: item.paymentType,
          },
        });

        if (item.slabId) {
          const slab = await tx.slab.findFirstOrThrow({ where: { id: item.slabId, factoryId } });
          await tx.slabStateTransition.create({
            data: { slabId: item.slabId, fromState: slab.salesStatus, toState: "sold", userId },
          });
          await tx.slab.update({ where: { id: item.slabId }, data: { salesStatus: "sold" } });
        }
      }

      return tx.salesOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { lineItems: true },
      });
    });
  }
}
