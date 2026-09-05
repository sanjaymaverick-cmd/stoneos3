import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private service: AuthService) {}

  // The only unguarded endpoint in the application. Everything else requires
  // a session token this returns.
  //
  // Brute-force protection comes from the global rate limiter in
  // common/http-security.ts (per-IP, per-process). That is a blunt instrument
  // rather than a per-account lockout; adequate for an in-house app on one
  // instance, and the place to tighten first if this is ever exposed wider.
  @Post("login")
  @HttpCode(200)
  login(@Body() body: { username: string; password: string }) {
    return this.service.login(body?.username, body?.password);
  }

  @Post("change-password")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.service.changePassword(user.id, body?.currentPassword, body?.newPassword);
  }

  // Lets the frontend rehydrate the signed-in user on a page load without
  // trusting anything it kept client-side. A revoked session fails here,
  // because SessionAuthGuard re-checks active/tokenVersion.
  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
