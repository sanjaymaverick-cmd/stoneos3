import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { SALES_DATA_ROLES, SALES_READ_ROLES } from "../../common/role-policy";
import { CustomerService } from "./customer.service";

@Controller("customers")
@UseGuards(SessionAuthGuard, RolesGuard)
export class CustomerController {
  constructor(private service: CustomerService) {}

  @Get()
  @Roles(...SALES_READ_ROLES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Post()
  @Roles(...SALES_DATA_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: { name: string; contactInfo?: string; creditLimit?: number }) {
    return this.service.create(user.factoryId, body.name, body.contactInfo, body.creditLimit);
  }
}
