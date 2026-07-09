import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { SlabService } from "./slab.service";

@Controller("slabs")
@UseGuards(ClerkAuthGuard)
export class SlabController {
  constructor(private service: SlabService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.factoryId);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.findOne(user.factoryId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    return this.service.create(user.factoryId, body);
  }

  @Post(":id/transition")
  transition(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.transition(user.factoryId, id, body.toState, user.id, body.machineId, body.notes);
  }
}
