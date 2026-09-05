import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { EXPENSE_DATA_ROLES } from "../../common/role-policy";
import { ExpenseService, EXPENSE_CATEGORIES } from "./expense.service";

@Controller("expenses")
@UseGuards(SessionAuthGuard, RolesGuard)
export class ExpenseController {
  constructor(private service: ExpenseService) {}

  @Get("categories")
  @Roles(...EXPENSE_DATA_ROLES)
  categories() {
    return EXPENSE_CATEGORIES;
  }

  @Get()
  @Roles(...EXPENSE_DATA_ROLES)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.findAll(user.factoryId, from, to);
  }

  @Post()
  @Roles(...EXPENSE_DATA_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, body);
  }

  @Post(":id/allocate")
  @Roles(...EXPENSE_DATA_ROLES)
  allocate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { allocations: any[] }) {
    return this.service.allocate(user.factoryId, id, body.allocations);
  }
}
