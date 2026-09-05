import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ANY_PROVISIONED_ROLE, USER_MANAGEMENT_ROLES } from "../../common/role-policy";
import { MachineService } from "./machine.service";

@Controller("machines")
@UseGuards(SessionAuthGuard, RolesGuard)
export class MachineController {
  constructor(private service: MachineService) {}

  // Every production page needs the machine dropdown, so the read is open to
  // all provisioned roles.
  @Get()
  @Roles(...ANY_PROVISIONED_ROLE)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  // Adding a machine is a registry change, not shop-floor input.
  @Post()
  @Roles(...USER_MANAGEMENT_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, body);
  }
}
