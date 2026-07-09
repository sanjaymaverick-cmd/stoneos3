import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { verifyToken } from "@clerk/backend";
import { clerkClient } from "../clerk-client";

// Verifies the Clerk session token on every request and attaches the
// decoded user (id, role, factoryId) to req.user. Role and factoryId are
// expected in Clerk's publicMetadata — set these when a user is
// provisioned (see modules/auth for the provisioning flow, TODO).
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing session token");
    }
    const token = authHeader.replace("Bearer ", "");

    try {
      const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      const user = await clerkClient.users.getUser(claims.sub);
      const metadata = user.publicMetadata as { factoryId?: string; role?: string };

      if (!metadata.factoryId || !metadata.role) {
        throw new UnauthorizedException("User is not provisioned with a factory/role yet");
      }

      req.user = {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress,
        factoryId: metadata.factoryId,
        role: metadata.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid session token");
    }
  }
}
