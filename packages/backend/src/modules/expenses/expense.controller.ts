import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ExpenseService, EXPENSE_CATEGORIES } from "./expense.service";

@Controller("expenses")
@UseGuards(ClerkAuthGuard)
export class ExpenseController {
  constructor(private service: ExpenseService) {}

  @Get("categories")
  categories() {
    return EXPENSE_CATEGORIES;
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.findAll(user.factoryId, from, to);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, body);
  }

  @Post(":id/allocate")
  allocate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { allocations: any[] }) {
    return this.service.allocate(user.factoryId, id, body.allocations);
  }
}
