import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { RawBlockService } from "./raw-block.service";

@Controller("raw-blocks")
@UseGuards(ClerkAuthGuard, RolesGuard)
export class RawBlockController {
  constructor(private service: RawBlockService) {}

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
    return this.service.create(user, body);
  }

  @Post(":id/transition")
  transition(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.transition(user.factoryId, id, { ...body, userId: user.id });
  }

  // Reconciling an estimated opening-balance figure always requires
  // elevated/accountant, regardless of what's in the request body — unlike
  // create()'s entrySource-conditional gating, this doesn't vary per
  // request, so it's expressed declaratively via RolesGuard instead of a
  // manual in-service check.
  @Post(":id/reconcile")
  @Roles("owner", "admin", "manager", "accountant")
  reconcile(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: any) {
    return this.service.reconcile(user.factoryId, id, body.fieldName, body.newValue, user);
  }
}
