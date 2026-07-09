import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { SalesOrderService } from "./sales-order.service";
import { DailySalesSummaryService } from "./daily-sales-summary.service";

@Controller("sales-orders")
@UseGuards(ClerkAuthGuard)
export class SalesOrderController {
  constructor(
    private service: SalesOrderService,
    private summaryService: DailySalesSummaryService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.findOne(user.factoryId, id);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    const order = await this.service.create(user.factoryId, user.id, body);
    // Keep the daily rollup honest immediately — don't wait for a batch job.
    await this.summaryService.recomputeFromLineItems(user.factoryId, body.orderDate);
    return order;
  }
}
