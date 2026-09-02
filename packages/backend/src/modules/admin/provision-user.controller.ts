import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { USER_MANAGEMENT_ROLES } from "../../common/role-policy";
import { ProvisionUserService } from "./provision-user.service";

@Controller("admin/users")
@UseGuards(ClerkAuthGuard, RolesGuard)
export class ProvisionUserController {
  constructor(private service: ProvisionUserService) {}

  @Get()
  @Roles(...USER_MANAGEMENT_ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listUsers(user.factoryId);
  }

  @Post()
  @Roles(...USER_MANAGEMENT_ROLES)
  provision(@CurrentUser() user: AuthenticatedUser, @Body() body: { email: string; role: string }) {
    // Always provisions into the CALLER's own factory — an owner can
    // never accidentally (or deliberately) grant access to a different
    // factory's data than their own.
    //
    // The caller's own role and email go through too: RolesGuard proves the
    // caller is in the elevated tier, but only the service can tell whether
    // granting or removing OWNERSHIP specifically is allowed.
    return this.service.provision(
      user.factoryId,
      { role: user.role, email: user.email },
      body.email,
      body.role,
    );
  }
}
