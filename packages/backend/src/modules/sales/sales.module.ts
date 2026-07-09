import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { SalesOrderController } from "./sales-order.controller";
import { SalesOrderService } from "./sales-order.service";
import { DailySalesSummaryController } from "./daily-sales-summary.controller";
import { DailySalesSummaryService } from "./daily-sales-summary.service";
import { CustomerController } from "./customer.controller";
import { CustomerService } from "./customer.service";

@Module({
  controllers: [SalesOrderController, DailySalesSummaryController, CustomerController],
  providers: [SalesOrderService, DailySalesSummaryService, CustomerService, PrismaService],
})
export class SalesModule {}
