import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { clerkClient } from "../../common/clerk-client";
import { PrismaService } from "../../common/prisma.service";
import { OWNER_ROLE, SCHEMA_ROLES } from "../../common/role-policy";

export interface ProvisionActor {
  role: string;
  email: string;
}

@Injectable()
export class ProvisionUserService {
  constructor(private prisma: PrismaService) {}

  // Called by an existing owner/admin/manager to grant a teammate access.
  // Looks the person up by the email they already signed up to Clerk with —
  // they must have created a Clerk account first (sign-up flow is
  // unrestricted; this step is what actually turns "has an account" into
  // "can see Vedam Granites' data").
  //
  // RolesGuard has already established that the caller is in the elevated
  // tier. `actor` narrows that further: owner, admin and manager are peers
  // for every other purpose, but ownership itself is the one thing only an
  // owner may hand out or take away. Without this, any manager could grant
  // themselves owner or demote the real one.
  //
  // Every check below runs BEFORE Clerk or the factory is touched, so a
  // refused request has no side effects.
  async provision(factoryId: string, actor: ProvisionActor, email: string, role: string) {
    if (!SCHEMA_ROLES.includes(role)) {
      throw new BadRequestException(`role must be one of: ${SCHEMA_ROLES.join(", ")}`);
    }

    const actorIsOwner = actor.role === OWNER_ROLE;

    // 1. Only an owner may grant ownership.
    if (role === OWNER_ROLE && !actorIsOwner) {
      throw new ForbiddenException("Only an owner can grant the owner role.");
    }

    const existing = await this.prisma.appUser.findUnique({ where: { email } });
    const targetIsOwnerHere = existing?.factoryId === factoryId && existing?.role === OWNER_ROLE;

    // 2. Only an owner may change an existing owner's role — otherwise a
    //    manager could quietly demote the person who appointed them.
    if (targetIsOwnerHere && !actorIsOwner) {
      throw new ForbiddenException("Only an owner can change another owner's role.");
    }

    // 3. An owner may not demote themselves. This is the last line of
    //    defence against locking the factory out of its own admin surface;
    //    the account performing the change would lose the ability to undo it.
    if (targetIsOwnerHere && actor.email === email && role !== OWNER_ROLE) {
      throw new ForbiddenException(
        "You cannot remove your own owner role. Ask another owner to do it.",
      );
    }

    const factory = await this.prisma.factory.findUniqueOrThrow({ where: { id: factoryId } });

    const { data: users } = await clerkClient.users.getUserList({ emailAddress: [email] });
    if (users.length === 0) {
      throw new NotFoundException(
        `No Clerk account found for ${email} — they need to sign up in the app first, then you can provision them.`,
      );
    }
    const clerkUser = users[0];

    await clerkClient.users.updateUserMetadata(clerkUser.id, {
      publicMetadata: { factoryId, role },
    });

    // Mirror into our own app_user table too, so the rest of the app
    // (e.g. attributing a userId on state transitions) has a local row
    // to reference rather than only living in Clerk.
    const appUser = await this.prisma.appUser.upsert({
      where: { email },
      update: { factoryId, role: role as any, active: true },
      create: { factoryId, email, name: clerkUser.firstName ?? email, role: role as any },
    });

    return { clerkUserId: clerkUser.id, appUser, factoryName: factory.name };
  }

  listUsers(factoryId: string) {
    return this.prisma.appUser.findMany({ where: { factoryId }, orderBy: { name: "asc" } });
  }
}
