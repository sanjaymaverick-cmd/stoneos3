import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { INVENTORY_DATA_ROLES, SALES_READ_ROLES, USER_MANAGEMENT_ROLES } from "../../common/role-policy";
import { InventoryLocationService } from "./inventory-location.service";
import { InventoryMovementService, RecordMovementInput } from "./inventory-movement.service";

@Controller("inventory-locations")
@UseGuards(SessionAuthGuard, RolesGuard)
export class InventoryLocationController {
  constructor(private service: InventoryLocationService) {}

  @Get()
  @Roles(...SALES_READ_ROLES)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  // Seeding the location set is a one-time factory setup step, not routine
  // inventory work — hence the elevated tier. Idempotent, so re-running is
  // harmless.
  @Post("seed-defaults")
  @Roles(...USER_MANAGEMENT_ROLES)
  seedDefaults(@CurrentUser() user: AuthenticatedUser) {
    return this.service.ensureDefaults(user.factoryId);
  }
}

@Controller("inventory-movements")
@UseGuards(SessionAuthGuard, RolesGuard)
export class InventoryMovementController {
  constructor(private service: InventoryMovementService) {}

  // Read surfaces are as wide as the rest of stock visibility — an auditor
  // reading the ledger is exactly the point of keeping one.
  @Get()
  @Roles(...SALES_READ_ROLES)
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query("rawBlockId") rawBlockId?: string,
    @Query("slabId") slabId?: string,
  ) {
    return this.service.history(user.factoryId, { rawBlockId, slabId });
  }

  @Get("on-hand")
  @Roles(...SALES_READ_ROLES)
  onHand(@CurrentUser() user: AuthenticatedUser) {
    return this.service.onHandByLocation(user.factoryId);
  }

  @Post()
  @Roles(...INVENTORY_DATA_ROLES)
  record(@CurrentUser() user: AuthenticatedUser, @Body() body: RecordMovementInput) {
    return this.service.record(user.factoryId, user.id, body);
  }

  // Reversal is a correction to the permanent record, so it sits with the
  // elevated tier rather than routine inventory input.
  @Post(":id/reverse")
  @Roles(...USER_MANAGEMENT_ROLES)
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: { reason: string; idempotencyKey: string },
  ) {
    return this.service.reverse(user.factoryId, user.id, id, body.reason, body.idempotencyKey);
  }
}
