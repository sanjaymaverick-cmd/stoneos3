import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { OWNER_ROLE, SCHEMA_ROLES } from "../../common/role-policy";
import { generatePassword, hashPassword } from "../../common/password";

export interface ProvisionActor {
  id: string;
  role: string;
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

@Injectable()
export class ProvisionUserService {
  constructor(private prisma: PrismaService) {}

  // Called by an existing owner/admin/manager to issue a login, or to change
  // the role on one that already exists.
  //
  // Since the move off Clerk this is where credentials are BORN: there is no
  // sign-up flow, so an employee has no way into the app until an owner calls
  // this and hands them the password it returns. That password is shown once,
  // here, and never again — only its scrypt hash is stored.
  //
  // RolesGuard has already established that the caller is in the elevated
  // tier. `actor` narrows that further: owner, admin and manager are peers for
  // every other purpose, but ownership itself is the one thing only an owner
  // may hand out or take away.
  //
  // Every check below runs BEFORE anything is written, so a refused request
  // has no side effects.
  async provision(
    factoryId: string,
    actor: ProvisionActor,
    input: { username: string; name?: string; email?: string; role: string },
  ) {
    const username = (input.username ?? "").trim().toLowerCase();
    const { role, name, email } = input;

    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException(
        "username must be 3-32 characters, lowercase letters/digits/._- and start with a letter or digit",
      );
    }
    if (!SCHEMA_ROLES.includes(role)) {
      throw new BadRequestException(`role must be one of: ${SCHEMA_ROLES.join(", ")}`);
    }

    const actorIsOwner = actor.role === OWNER_ROLE;

    // 1. Only an owner may grant ownership.
    if (role === OWNER_ROLE && !actorIsOwner) {
      throw new ForbiddenException("Only an owner can grant the owner role.");
    }

    const existing = await this.prisma.appUser.findUnique({ where: { username } });

    // A username taken in another factory is not available here either — it is
    // the global login identifier. Report it as taken without confirming which
    // factory holds it.
    if (existing && existing.factoryId !== factoryId) {
      throw new BadRequestException(`Username "${username}" is already taken.`);
    }

    const targetIsOwnerHere = existing?.role === OWNER_ROLE;

    // 2. Only an owner may change an existing owner's role — otherwise a
    //    manager could quietly demote the person who appointed them.
    if (targetIsOwnerHere && !actorIsOwner) {
      throw new ForbiddenException("Only an owner can change another owner's role.");
    }

    // 3. An owner may not demote themselves. This is the last line of defence
    //    against locking the factory out of its own admin surface; the account
    //    performing the change would lose the ability to undo it.
    if (targetIsOwnerHere && existing?.id === actor.id && role !== OWNER_ROLE) {
      throw new ForbiddenException("You cannot remove your own owner role. Ask another owner to do it.");
    }

    await this.prisma.factory.findUniqueOrThrow({ where: { id: factoryId } });

    // Existing account: this is a role change (promotion or reassignment).
    // The password is deliberately left alone — changing someone's role must
    // not silently sign them out or invalidate credentials they already hold.
    if (existing) {
      const updated = await this.prisma.appUser.update({
        where: { id: existing.id },
        data: {
          role: role as any,
          active: true,
          ...(name ? { name } : {}),
          ...(email !== undefined ? { email: email || null } : {}),
        },
      });
      return { created: false, user: publicUser(updated), password: null };
    }

    // New account: generate the password the owner will hand over.
    const password = generatePassword();
    const created = await this.prisma.appUser.create({
      data: {
        factoryId,
        username,
        name: name?.trim() || username,
        email: email || null,
        role: role as any,
        passwordHash: await hashPassword(password),
      },
    });

    return { created: true, user: publicUser(created), password };
  }

  // Revoke access — the employee-has-left path.
  //
  // Sets active=false AND bumps tokenVersion. Either alone would do it, but
  // together they close both doors: the account can no longer sign in, and
  // every session token already issued for it stops verifying on its next
  // request. Someone walking out with the app open on their phone loses access
  // on their next tap, not whenever their token would have expired.
  //
  // The row is kept rather than deleted: inventory and production records
  // reference who recorded them, and deleting the user would orphan that
  // history.
  async revoke(factoryId: string, actor: ProvisionActor, userId: string) {
    const target = await this.findInFactory(factoryId, userId);

    if (target.id === actor.id) {
      throw new ForbiddenException("You cannot revoke your own access.");
    }
    if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE) {
      throw new ForbiddenException("Only an owner can revoke another owner.");
    }

    const updated = await this.prisma.appUser.update({
      where: { id: target.id },
      data: { active: false, tokenVersion: { increment: 1 } },
    });
    return { user: publicUser(updated) };
  }

  // Restore access to a previously revoked account. Issues a fresh password —
  // the old one is not recoverable, and reusing it would be wrong anyway if
  // the reason for revoking was that it may have been compromised.
  async reinstate(factoryId: string, actor: ProvisionActor, userId: string) {
    const target = await this.findInFactory(factoryId, userId);

    if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE) {
      throw new ForbiddenException("Only an owner can reinstate another owner.");
    }

    const password = generatePassword();
    const updated = await this.prisma.appUser.update({
      where: { id: target.id },
      data: { active: true, passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    });
    return { user: publicUser(updated), password };
  }

  // Owner-driven password reset, for the "they forgot it" case. Bumps
  // tokenVersion so any session opened with the old password is dropped.
  async resetPassword(factoryId: string, actor: ProvisionActor, userId: string) {
    const target = await this.findInFactory(factoryId, userId);

    if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE && target.id !== actor.id) {
      throw new ForbiddenException("Only an owner can reset another owner's password.");
    }

    const password = generatePassword();
    const updated = await this.prisma.appUser.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    });
    return { user: publicUser(updated), password };
  }

  listUsers(factoryId: string) {
    return this.prisma.appUser.findMany({
      where: { factoryId },
      orderBy: { name: "asc" },
      select: { id: true, username: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  // Scoping every lookup by factoryId is what stops an owner of one factory
  // from acting on another factory's users by guessing an id.
  private async findInFactory(factoryId: string, userId: string) {
    const target = await this.prisma.appUser.findFirst({ where: { id: userId, factoryId } });
    if (!target) throw new NotFoundException("No such user in this factory.");
    return target;
  }
}

function publicUser(user: {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}
