import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { CuttingSessionService } from "./cutting-session.service";
import { PolishingSessionService } from "./polishing-session.service";

@Controller("cutting-sessions")
@UseGuards(ClerkAuthGuard)
export class CuttingSessionController {
  constructor(private service: CuttingSessionService) {}

  @Get("active")
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findActive(user.factoryId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.start(user.factoryId, user.id, body);
  }

  @Post(":id/day-log")
  dayLog(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.upsertDayLog(id, user.id, body);
  }

  @Post(":id/complete")
  complete(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.complete(user.factoryId, user.id, id, body);
  }
}

@Controller("polishing-sessions")
@UseGuards(ClerkAuthGuard)
export class PolishingSessionController {
  constructor(private service: PolishingSessionService) {}

  @Get()
  findByDate(@CurrentUser() user: AuthenticatedUser, @Query("date") date: string) {
    return this.service.findByDate(user.factoryId, date);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, user.id, body);
  }
}
