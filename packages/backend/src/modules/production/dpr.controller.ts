import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { DprService } from "./dpr.service";

@Controller("dpr")
@UseGuards(ClerkAuthGuard)
export class DprController {
  constructor(private service: DprService) {}

  @Get()
  findByDate(@CurrentUser() user: AuthenticatedUser, @Query("date") date: string) {
    return this.service.findByDate(user.factoryId, date);
  }

  @Post()
  upsert(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.upsert(user.factoryId, body);
  }
}
