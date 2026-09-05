import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { verifySession } from "../session-token";

// Verifies the app's own session token on every request and attaches the
// user (id, username, factoryId, role) to req.user. Replaces the old Clerk guard;
// the shape of req.user is unchanged apart from username, so RolesGuard and
// every @CurrentUser() controller keep working as they did.
//
// The signature alone is NOT enough to let a request through. Every request
// re-reads the row, because two things must be true right now rather than at
// the moment the token was issued:
//
//   active         — a revoked employee is refused on their very next tap
//   tokenVersion   — bumped by revoke and by password change, which
//                    invalidates every token already in the wild
//
// That is one indexed primary-key lookup per request, which is the price of
// revocation that actually takes effect immediately.
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing session token");
    }

    const claims = verifySession(authHeader.slice("Bearer ".length));
    if (!claims) throw new UnauthorizedException("Invalid session token");

    const user = await this.prisma.appUser.findUnique({ where: { id: claims.sub } });

    // One message for every failure mode below. Distinguishing "deleted" from
    // "revoked" from "stale token" would tell a probe more than it should
    // learn, and the client's response is the same in all three cases: sign in
    // again.
    if (!user || !user.active || user.tokenVersion !== claims.tv) {
      throw new UnauthorizedException("Session is no longer valid");
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      factoryId: user.factoryId,
      role: user.role,
    };
    return true;
  }
}
