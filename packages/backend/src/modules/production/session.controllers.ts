import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ANY_PROVISIONED_ROLE, PRODUCTION_INPUT_ROLES } from "../../common/role-policy";
import { CuttingSessionService } from "./cutting-session.service";
import { PolishingSessionService } from "./polishing-session.service";

@Controller("cutting-sessions")
@UseGuards(SessionAuthGuard, RolesGuard)
export class CuttingSessionController {
  constructor(private service: CuttingSessionService) {}

  @Get("active")
  @Roles(...ANY_PROVISIONED_ROLE)
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findActive(user.factoryId);
  }

  @Get()
  @Roles(...ANY_PROVISIONED_ROLE)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Post()
  @Roles(...PRODUCTION_INPUT_ROLES)
  start(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.start(user.factoryId, user.id, body);
  }

  @Post(":id/day-log")
  @Roles(...PRODUCTION_INPUT_ROLES)
  dayLog(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.upsertDayLog(user.factoryId, id, user.id, body);
  }

  @Post(":id/complete")
  @Roles(...PRODUCTION_INPUT_ROLES)
  complete(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.complete(user.factoryId, user.id, id, body);
  }
}

@Controller("polishing-sessions")
@UseGuards(SessionAuthGuard, RolesGuard)
export class PolishingSessionController {
  constructor(private service: PolishingSessionService) {}

  @Get()
  @Roles(...ANY_PROVISIONED_ROLE)
  findByDate(@CurrentUser() user: AuthenticatedUser, @Query("date") date: string) {
    return this.service.findByDate(user.factoryId, date);
  }

  @Post()
  @Roles(...PRODUCTION_INPUT_ROLES)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, user.id, body);
  }
}
