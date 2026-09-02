import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ProvisionUserService } from "./provision-user.service";

const OWNER = { role: "owner", email: "owner@example.com" };
const MANAGER = { role: "manager", email: "manager@example.com" };
const ADMIN = { role: "admin", email: "admin@example.com" };

// A prisma double whose factory lookup throws, so a call that clears every
// authorization check stops at a known point instead of reaching Clerk.
function prismaStub(existingUser: unknown = null) {
  return {
    appUser: { findUnique: jest.fn().mockResolvedValue(existingUser), upsert: jest.fn() },
    factory: { findUniqueOrThrow: jest.fn().mockRejectedValue(new Error("reached factory lookup")) },
  };
}

const ownerOf = (factoryId: string, email = "owner@example.com") => ({
  email,
  factoryId,
  role: "owner",
});

describe("ProvisionUserService.provision", () => {
  describe("role validation", () => {
    it("rejects a role outside the schema enum before touching anything", async () => {
      const prisma = prismaStub();
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, "someone@example.com", "superuser")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("names the acceptable roles in the rejection message", async () => {
      const service = new ProvisionUserService(prismaStub() as any);

      await expect(service.provision("factory-a", OWNER, "someone@example.com", "")).rejects.toThrow(/owner/);
    });
  });

  describe("only an owner may grant ownership", () => {
    it.each([MANAGER, ADMIN])("refuses $role granting the owner role", async (actor) => {
      const prisma = prismaStub();
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", actor, "newbie@example.com", "owner")).rejects.toBeInstanceOf(
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
      await expect(service.provision("factory-a", OWNER, "cofounder@example.com", "owner")).rejects.toThrow(
        "reached factory lookup",
      );
    });
  });

  describe("only an owner may change an existing owner", () => {
    it.each([MANAGER, ADMIN])("refuses $role demoting an existing owner", async (actor) => {
      const prisma = prismaStub(ownerOf("factory-a"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", actor, "owner@example.com", "manager")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("allows another owner to change an owner's role", async () => {
      const prisma = prismaStub(ownerOf("factory-a", "cofounder@example.com"));
      const service = new ProvisionUserService(prisma as any);

      await expect(
        service.provision("factory-a", OWNER, "cofounder@example.com", "manager"),
      ).rejects.toThrow("reached factory lookup");
    });

    it("does not treat another factory's owner as protected here", async () => {
      // The same email owning a DIFFERENT factory is an ordinary reassignment
      // into this one, not an attempt to demote this factory's owner.
      const prisma = prismaStub(ownerOf("factory-b"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", MANAGER, "owner@example.com", "supervisor")).rejects.toThrow(
        "reached factory lookup",
      );
    });

    it("lets a manager provision an ordinary teammate", async () => {
      const prisma = prismaStub({ email: "op@example.com", factoryId: "factory-a", role: "operator" });
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", MANAGER, "op@example.com", "supervisor")).rejects.toThrow(
        "reached factory lookup",
      );
    });
  });

  describe("an owner cannot remove their own ownership", () => {
    it("refuses an owner demoting themselves", async () => {
      const prisma = prismaStub(ownerOf("factory-a", "owner@example.com"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, "owner@example.com", "manager")).rejects.toThrow(
        /cannot remove your own owner role/,
      );
      expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("still lets an owner re-apply owner to themselves", async () => {
      const prisma = prismaStub(ownerOf("factory-a", "owner@example.com"));
      const service = new ProvisionUserService(prisma as any);

      await expect(service.provision("factory-a", OWNER, "owner@example.com", "owner")).rejects.toThrow(
        "reached factory lookup",
      );
    });

    it("lets one owner demote a different owner", async () => {
      const prisma = prismaStub(ownerOf("factory-a", "cofounder@example.com"));
      const service = new ProvisionUserService(prisma as any);

      await expect(
        service.provision("factory-a", OWNER, "cofounder@example.com", "manager"),
      ).rejects.toThrow("reached factory lookup");
    });
  });

  it("scopes the team listing to one factory", () => {
    const findMany = jest.fn();
    new ProvisionUserService({ appUser: { findMany } } as any).listUsers("factory-a");

    expect(findMany).toHaveBeenCalledWith({
      where: { factoryId: "factory-a" },
      orderBy: { name: "asc" },
    });
  });
});
