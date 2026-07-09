import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { CustomerService } from "./customer.service";

@Controller("customers")
@UseGuards(ClerkAuthGuard)
export class CustomerController {
  constructor(private service: CustomerService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: { name: string; contactInfo?: string; creditLimit?: number }) {
    return this.service.create(user.factoryId, body.name, body.contactInfo, body.creditLimit);
  }
}
