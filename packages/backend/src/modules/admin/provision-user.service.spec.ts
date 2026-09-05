import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProvisionUserService } from "./provision-user.service";

const OWNER = { id: "u-owner", role: "owner" };
const MANAGER = { id: "u-manager", role: "manager" };
const ADMIN = { id: "u-admin", role: "admin" };

// A prisma double whose factory lookup throws, so a call that clears every
// authorization check stops at a known point instead of writing anything.
function prismaStub(existingUser: unknown = null) {
  return {
    appUser: {
      findUnique: jest.fn().mockResolvedValue(existingUser),
      findFirst: jest.fn().mockResolvedValue(existingUser),
      create: jest.fn(),
      update: jest.fn(),
    },
    factory: { findUniqueOrThrow: jest.fn().mockRejectedValue(new Error("reached factory lookup")) },
  };
}

const ownerOf = (factoryId: string, id = "u-owner") => ({
  id,
  username: "owner",
  factoryId,
  role: "owner",
  active: true,
});

// The new signature takes a body rather than a bare email.
const body = (username: string, role: string) => ({ username, role });

describe("ProvisionUserService.provision", () => {
  describe("input validation", () => {
    it("rejects a role outside the schema enum before touching anything", async () => {
      const prisma = prismaStub();
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, body("someone", "superuser"))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("names the acceptable roles in the rejection message", async () => {
      const service = new ProvisionUserService(prismaStub() as any);

      await expect(service.provision("factory-a", OWNER, body("someone", ""))).rejects.toThrow(/owner/);
    });

    it.each(["ab", "Has Capitals", "has space", "-leading-dash", "way".repeat(20)])(
      "rejects the invalid username %p",
      async (username) => {
        const prisma = prismaStub();
        const service = new ProvisionUserService(prisma as any);

        await expect(service.provision("factory-a", OWNER, body(username, "operator"))).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe("only an owner may grant ownership", () => {
    it.each([MANAGER, ADMIN])("refuses $role granting the owner role", async (actor) => {
      const prisma = prismaStub();
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", actor, body("newbie", "owner"))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Refused before any lookup, so the request has no side effects.
      expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("allows an owner to grant the owner role", async () => {
      const prisma = prismaStub();
      const service = new ProvisionUserService(prisma as any);

      // Clearing authorization means it reaches the factory lookup.
      await expect(service.provision("factory-a", OWNER, body("cofounder", "owner"))).rejects.toThrow(
        "reached factory lookup",
      );
    });
  });

  describe("only an owner may change an existing owner", () => {
    it.each([MANAGER, ADMIN])("refuses $role demoting an existing owner", async (actor) => {
      const prisma = prismaStub(ownerOf("factory-a"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", actor, body("owner", "manager"))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("allows another owner to change an owner's role", async () => {
      const prisma = prismaStub(ownerOf("factory-a", "u-cofounder"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, body("owner", "manager"))).rejects.toThrow(
        "reached factory lookup",
      );
    });

    it("refuses a username already held in another factory", async () => {
      // Username is the global login identifier, so it cannot be claimed here
      // while another factory holds it. Reported as taken without confirming
      // which factory that is.
      const prisma = prismaStub(ownerOf("factory-b"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", MANAGER, body("owner", "supervisor"))).rejects.toThrow(
        /already taken/,
      );
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("lets a manager provision an ordinary teammate", async () => {
      const prisma = prismaStub({ id: "u-op", username: "op.k", factoryId: "factory-a", role: "operator", active: true });
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", MANAGER, body("op.k", "supervisor"))).rejects.toThrow(
        "reached factory lookup",
      );
    });
  });

  describe("an owner cannot remove their own ownership", () => {
    it("refuses an owner demoting themselves", async () => {
      const prisma = prismaStub(ownerOf("factory-a", OWNER.id));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, body("owner", "manager"))).rejects.toThrow(
        /cannot remove your own owner role/,
      );
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("still lets an owner re-apply owner to themselves", async () => {
      const prisma = prismaStub(ownerOf("factory-a", OWNER.id));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, body("owner", "owner"))).rejects.toThrow(
        "reached factory lookup",
      );
    });

    it("lets one owner demote a different owner", async () => {
      const prisma = prismaStub(ownerOf("factory-a", "u-cofounder"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, body("owner", "manager"))).rejects.toThrow(
        "reached factory lookup",
      );
    });
  });

  describe("issuing credentials", () => {
    it("returns a one-time password when the account is new", async () => {
      const prisma = prismaStub(null);
      prisma.factory.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "factory-a" });
      prisma.appUser.create = jest.fn().mockImplementation(({ data }: any) => ({ ...data, id: "u-new", active: true }));
      const service = new ProvisionUserService(prisma as any);

      const result = await service.provision("factory-a", OWNER, body("ramesh.k", "operator"));

      expect(result.created).toBe(true);
      expect(result.password).toEqual(expect.any(String));
      expect(result.password!.length).toBeGreaterThanOrEqual(12);
      // The hash is stored, never the password itself.
      const written = (prisma.appUser.create as jest.Mock).mock.calls[0][0].data;
      expect(written.passwordHash).toMatch(/^scrypt\$/);
      expect(written.passwordHash).not.toContain(result.password);
      // And the response never leaks the hash.
      expect(JSON.stringify(result.user)).not.toContain("scrypt$");
    });

    it("does not reissue or disturb a password on a role change", async () => {
      const prisma = prismaStub({
        id: "u-op",
        username: "op.k",
        factoryId: "factory-a",
        role: "operator",
        active: true,
      });
      prisma.factory.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "factory-a" });
      prisma.appUser.update = jest.fn().mockResolvedValue({
        id: "u-op",
        username: "op.k",
        name: "op",
        email: null,
        role: "supervisor",
        active: true,
      });
      const service = new ProvisionUserService(prisma as any);

      const result = await service.provision("factory-a", MANAGER, body("op.k", "supervisor"));

      expect(result.created).toBe(false);
      expect(result.password).toBeNull();
      expect((prisma.appUser.update as jest.Mock).mock.calls[0][0].data).not.toHaveProperty("passwordHash");
    });
  });
});

describe("ProvisionUserService.revoke", () => {
  function revokeStub(target: unknown) {
    return {
      appUser: { findFirst: jest.fn().mockResolvedValue(target), update: jest.fn().mockResolvedValue(target) },
      factory: { findUniqueOrThrow: jest.fn() },
    };
  }

  it("deactivates the account and bumps tokenVersion so live sessions die", async () => {
    const target = { id: "u-op", username: "op.k", name: "op", email: null, factoryId: "factory-a", role: "operator", active: false };
    const prisma = revokeStub(target);
    const service = new ProvisionUserService(prisma as any);

    await service.revoke("factory-a", OWNER, "u-op");

    expect(prisma.appUser.update).toHaveBeenCalledWith({
      where: { id: "u-op" },
      data: { active: false, tokenVersion: { increment: 1 } },
    });
  });

  it("refuses to revoke a user from another factory", async () => {
    // findFirst is scoped by factoryId, so a cross-factory id simply misses.
    const prisma = revokeStub(null);
    const service = new ProvisionUserService(prisma as any);

    await expect(service.revoke("factory-a", OWNER, "u-elsewhere")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });

  it("refuses self-revocation, so a factory cannot lock itself out", async () => {
    const prisma = revokeStub({ ...ownerOf("factory-a", OWNER.id), name: "owner", email: null });
    const service = new ProvisionUserService(prisma as any);

    await expect(service.revoke("factory-a", OWNER, OWNER.id)).rejects.toThrow(/cannot revoke your own access/);
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });

  it.each([MANAGER, ADMIN])("refuses $role revoking an owner", async (actor) => {
    const prisma = revokeStub({ ...ownerOf("factory-a", "u-owner"), name: "owner", email: null });
    const service = new ProvisionUserService(prisma as any);

    await expect(service.revoke("factory-a", actor, "u-owner")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });
});

describe("ProvisionUserService.listUsers", () => {
  it("scopes the team listing to one factory and never selects the hash", () => {
    const findMany = jest.fn();
    new ProvisionUserService({ appUser: { findMany } } as any).listUsers("factory-a");

    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ factoryId: "factory-a" });
    expect(args.orderBy).toEqual({ name: "asc" });
    expect(args.select.passwordHash).toBeUndefined();
    expect(args.select.tokenVersion).toBeUndefined();
  });
});
