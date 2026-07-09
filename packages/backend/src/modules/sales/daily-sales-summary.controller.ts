import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { DailySalesSummaryService } from "./daily-sales-summary.service";

@Controller("daily-sales-summary")
@UseGuards(ClerkAuthGuard)
export class DailySalesSummaryController {
  constructor(private service: DailySalesSummaryService) {}

  @Get()
  findRange(@CurrentUser() user: AuthenticatedUser, @Query("from") from: string, @Query("to") to: string) {
    return this.service.findByDate(user.factoryId, from, to);
  }

  // For the one-time historical backfill only. Do not call this from
  // day-to-day UI — day-to-day totals are derived automatically from
  // real sales orders via SalesOrderController.
  @Post("backfill")
  backfill(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.backfill(user.factoryId, body.summaryDate, body.totalQtySqft, body.invoicedAmount, body.actualAmountReceived);
  }
}
