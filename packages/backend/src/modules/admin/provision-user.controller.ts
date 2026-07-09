import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ProvisionUserService } from "./provision-user.service";

@Controller("admin/users")
@UseGuards(ClerkAuthGuard, RolesGuard)
export class ProvisionUserController {
  constructor(private service: ProvisionUserService) {}

  @Get()
  @Roles("owner", "admin")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listUsers(user.factoryId);
  }

  @Post()
  @Roles("owner", "admin")
  provision(@CurrentUser() user: AuthenticatedUser, @Body() body: { email: string; role: string }) {
    // Always provisions into the CALLER's own factory — an owner can
    // never accidentally (or deliberately) grant access to a different
    // factory's data than their own.
    return this.service.provision(user.factoryId, body.email, body.role);
  }
}
