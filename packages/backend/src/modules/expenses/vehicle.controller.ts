import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { EXPENSE_DATA_ROLES } from "../../common/role-policy";
import { VehicleService } from "./vehicle.service";

@Controller("vehicles")
@UseGuards(SessionAuthGuard, RolesGuard)
export class VehicleController {
  constructor(private service: VehicleService) {}

  @Get()
  @Roles(...EXPENSE_DATA_ROLES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  // Vehicles exist to be attached to expenses, so they follow the expense
  // role set rather than a registry-admin one.
  @Post()
  @Roles(...EXPENSE_DATA_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: { name: string; vehicleType?: string; purchaseDate?: string }) {
    return this.service.create(user.factoryId, body.name, body.vehicleType, body.purchaseDate);
  }
}
