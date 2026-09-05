import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { HISTORICAL_IMPORT_ROLES, SALES_READ_ROLES } from "../../common/role-policy";
import {
  AddRawBlockInput,
  AddSlabInput,
  OpeningInventoryService,
  StartCountInput,
} from "./opening-inventory.service";

// The opening count establishes the factory's starting stock position and
// flips it LIVE, so every mutating step sits with the elevated tier — the same
// set that owns historical imports.
@Controller("opening-inventory")
@UseGuards(SessionAuthGuard, RolesGuard)
export class OpeningInventoryController {
  constructor(private service: OpeningInventoryService) {}

  @Get()
  @Roles(...SALES_READ_ROLES)
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findCurrent(user.factoryId);
  }

  @Get(":id")
  @Roles(...SALES_READ_ROLES)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.findOne(user.factoryId, id);
  }

  @Post()
  @Roles(...HISTORICAL_IMPORT_ROLES)
  start(@CurrentUser() user: AuthenticatedUser, @Body() body: StartCountInput) {
    return this.service.start(user.factoryId, user.id, body);
  }

  @Post(":id/raw-blocks")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  addRawBlock(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: AddRawBlockInput) {
    return this.service.addRawBlock(user.factoryId, id, body);
  }

  @Post(":id/slabs")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  addSlab(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: AddSlabInput) {
    return this.service.addSlab(user.factoryId, id, body);
  }

  @Delete(":id/lines/:lineId")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  removeLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
  ) {
    return this.service.removeLine(user.factoryId, id, lineId);
  }

  @Post(":id/submit")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  submit(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.submit(user.factoryId, id, user.id);
  }

  @Post(":id/approve")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  approve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.approve(user.factoryId, id, user.id);
  }

  @Post(":id/reject")
  @Roles(...HISTORICAL_IMPORT_ROLES)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: { reason: string },
  ) {
    return this.service.reject(user.factoryId, id, user.id, body.reason);
  }
}
