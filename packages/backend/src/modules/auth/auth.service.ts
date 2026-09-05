import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { hashPassword, verifyPassword } from "../../common/password";
import { signSession } from "../../common/session-token";

export const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // Sign-in. There is no sign-up: accounts exist only because an owner or
  // admin created them through POST /admin/users.
  async login(username: string, password: string) {
    if (!username || !password) {
      throw new BadRequestException("username and password are required");
    }

    const user = await this.prisma.appUser.findUnique({ where: { username } });

    // Deliberately verify a password even when the user does not exist, so
    // the response time does not reveal which usernames are real. The dummy
    // hash below is a real scrypt hash of a random value; verifying against
    // it costs the same as verifying a genuine one.
    const storedHash = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await verifyPassword(password, storedHash);

    // One message for every failure: unknown user, wrong password, revoked
    // account. Anything more specific is an account-enumeration oracle.
    if (!user || !user.active || !passwordMatches) {
      throw new UnauthorizedException("Invalid username or password");
    }

    return {
      token: signSession({
        sub: user.id,
        username: user.username,
        factoryId: user.factoryId,
        role: user.role,
        tv: user.tokenVersion,
      }),
      user: this.publicUser(user),
    };
  }

  // Changing a password bumps tokenVersion, which invalidates every session
  // already issued for this account — including the one making this request.
  // A fresh token comes back so the caller is not signed out of their own
  // password change, while a session on some other device is.
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException("Session is no longer valid");

    if (!(await verifyPassword(currentPassword ?? "", user.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const updated = await this.prisma.appUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    });

    return {
      token: signSession({
        sub: updated.id,
        username: updated.username,
        factoryId: updated.factoryId,
        role: updated.role,
        tv: updated.tokenVersion,
      }),
      user: this.publicUser(updated),
    };
  }

  // Never returns passwordHash or tokenVersion.
  private publicUser(user: { id: string; username: string; name: string; email: string | null; role: string; factoryId: string }) {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      factoryId: user.factoryId,
    };
  }
}

// A fixed, valid scrypt hash used only to keep the failed-login path doing the
// same work as the successful one. No password produces it.
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
