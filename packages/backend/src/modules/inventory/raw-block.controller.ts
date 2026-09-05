import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import {
  INVENTORY_DATA_ROLES,
  PRODUCTION_INPUT_ROLES,
  RECONCILIATION_ROLES,
  SALES_READ_ROLES,
} from "../../common/role-policy";
import { RawBlockService } from "./raw-block.service";

@Controller("raw-blocks")
@UseGuards(SessionAuthGuard, RolesGuard)
export class RawBlockController {
  constructor(private service: RawBlockService) {}

  @Get()
  @Roles(...SALES_READ_ROLES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  // Must be declared before @Get(":id") — otherwise Nest matches this path as
  // GET(":id") with id = "recovery-ratio" and it never reaches this handler.
  @Get("recovery-ratio")
  @Roles(...SALES_READ_ROLES)
  findRecoveryRatios(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findRecoveryRatios(user.factoryId);
  }

  @Get(":id")
  @Roles(...SALES_READ_ROLES)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.findOne(user.factoryId, id);
  }

  // Receiving a block is an inventory action. create() additionally applies
  // its own entrySource-conditional check inside the service.
  @Post()
  @Roles(...INVENTORY_DATA_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user, body);
  }

  @Post(":id/transition")
  @Roles(...PRODUCTION_INPUT_ROLES)
  transition(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.transition(user.factoryId, id, { ...body, userId: user.id });
  }

  // Reconciling an estimated opening-balance figure always requires
  // elevated/accountant, regardless of what's in the request body — unlike
  // create()'s entrySource-conditional gating, this doesn't vary per
  // request, so it's expressed declaratively via RolesGuard instead of a
  // manual in-service check. RECONCILIATION_ROLES preserves exactly the set
  // that was hard-coded here.
  @Post(":id/reconcile")
  @Roles(...RECONCILIATION_ROLES)
  reconcile(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.reconcile(user.factoryId, id, body.fieldName, body.newValue, user);
  }
}
