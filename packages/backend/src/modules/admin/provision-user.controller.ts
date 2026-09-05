import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { USER_MANAGEMENT_ROLES } from "../../common/role-policy";
import { ProvisionUserService } from "./provision-user.service";

@Controller("admin/users")
@UseGuards(SessionAuthGuard, RolesGuard)
export class ProvisionUserController {
  constructor(private service: ProvisionUserService) {}

  @Get()
  @Roles(...USER_MANAGEMENT_ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listUsers(user.factoryId);
  }

  // Issue a login, or change the role on one that already exists.
  //
  // On creation the response carries a one-time `password` for the owner to
  // hand over. It is never retrievable again — a forgotten password is a
  // reset (below), not a lookup.
  @Post()
  @Roles(...USER_MANAGEMENT_ROLES)
  provision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { username: string; name?: string; email?: string; role: string },
  ) {
    // Always provisions into the CALLER's own factory — an owner can never
    // accidentally (or deliberately) grant access to a different factory's
    // data than their own.
    //
    // The caller's own id and role go through too: RolesGuard proves the
    // caller is in the elevated tier, but only the service can tell whether
    // granting or removing OWNERSHIP specifically is allowed.
    return this.service.provision(user.factoryId, { id: user.id, role: user.role }, body);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  @Roles(...USER_MANAGEMENT_ROLES)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.revoke(user.factoryId, { id: user.id, role: user.role }, id);
  }

  @Post(":id/reinstate")
  @HttpCode(200)
  @Roles(...USER_MANAGEMENT_ROLES)
  reinstate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.reinstate(user.factoryId, { id: user.id, role: user.role }, id);
  }

  @Post(":id/reset-password")
  @HttpCode(200)
  @Roles(...USER_MANAGEMENT_ROLES)
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.resetPassword(user.factoryId, { id: user.id, role: user.role }, id);
  }
}
