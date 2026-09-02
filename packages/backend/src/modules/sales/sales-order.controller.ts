import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { SALES_DATA_ROLES, SALES_READ_ROLES } from "../../common/role-policy";
import { SalesOrderService } from "./sales-order.service";
import { DailySalesSummaryService } from "./daily-sales-summary.service";

@Controller("sales-orders")
@UseGuards(ClerkAuthGuard, RolesGuard)
export class SalesOrderController {
  constructor(
    private service: SalesOrderService,
    private summaryService: DailySalesSummaryService,
  ) {}

  @Get()
  @Roles(...SALES_READ_ROLES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Get(":id")
  @Roles(...SALES_READ_ROLES)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.findOne(user.factoryId, id);
  }

  @Post()
  @Roles(...SALES_DATA_ROLES)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    const order = await this.service.create(user.factoryId, user.id, body);
    // Keep the daily rollup honest immediately — don't wait for a batch job.
    await this.summaryService.recomputeFromLineItems(user.factoryId, body.orderDate);
    return order;
  }
}
