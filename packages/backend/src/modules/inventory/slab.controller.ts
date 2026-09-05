import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { INVENTORY_DATA_ROLES, PRODUCTION_INPUT_ROLES, SALES_READ_ROLES } from "../../common/role-policy";
import { SlabService } from "./slab.service";

@Controller("slabs")
@UseGuards(SessionAuthGuard, RolesGuard)
export class SlabController {
  constructor(private service: SlabService) {}

  // Stock visibility is broad — sales and audit need it as much as inventory.
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
  @Roles(...INVENTORY_DATA_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, body);
  }

  // A state change is a production floor action, so operators are included
  // here where they are not on create.
  @Post(":id/transition")
  @Roles(...PRODUCTION_INPUT_ROLES)
  transition(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.transition(user.factoryId, id, body.toState, user.id, body.machineId, body.notes);
  }
}
