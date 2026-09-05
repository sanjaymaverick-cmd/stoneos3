import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { HISTORICAL_IMPORT_ROLES, SALES_READ_ROLES } from "../../common/role-policy";
import { DailySalesSummaryService } from "./daily-sales-summary.service";

@Controller("daily-sales-summary")
@UseGuards(SessionAuthGuard, RolesGuard)
export class DailySalesSummaryController {
  constructor(private service: DailySalesSummaryService) {}

  @Get()
  @Roles(...SALES_READ_ROLES)
  findRange(@CurrentUser() user: AuthenticatedUser, @Query("from") from: string, @Query("to") to: string) {
    return this.service.findByDate(user.factoryId, from, to);
  }

  // For the one-time historical backfill only. Do not call this from
  // day-to-day UI — day-to-day totals are derived automatically from
  // real sales orders via SalesOrderController. Writing history over
  // derived figures is an elevated action, hence HISTORICAL_IMPORT_ROLES.
  @Post("backfill")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  backfill(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.backfill(user.factoryId, body.summaryDate, body.totalQtySqft, body.invoicedAmount, body.actualAmountReceived);
  }
}
