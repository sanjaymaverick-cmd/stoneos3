import { BadRequestException } from "@nestjs/common";
import { ProvisionUserService } from "./provision-user.service";

// Written against stoneos3's own ProvisionUserService. ston3gpt's spec asserts
// that a manager cannot demote an existing owner; that check cannot exist here
// because this `provision` receives no actor identity or role — see the gap at
// the bottom.
describe("ProvisionUserService.provision", () => {
  it("rejects a role outside the known set before touching Clerk or the database", async () => {
    const prisma = { factory: { findUniqueOrThrow: jest.fn() }, appUser: { upsert: jest.fn() } };
    const service = new ProvisionUserService(prisma as any);

    await expect(service.provision("factory-a", "someone@example.com", "superuser")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.factory.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.appUser.upsert).not.toHaveBeenCalled();
  });

  it("names the acceptable roles in the rejection message", async () => {
    const service = new ProvisionUserService({} as any);

    await expect(service.provision("factory-a", "someone@example.com", "")).rejects.toThrow(/owner/);
  });

  it.each(["owner", "manager", "supervisor", "operator", "accountant", "auditor", "admin"])(
    "accepts the schema role %s past validation",
    async (role) => {
      const prisma = { factory: { findUniqueOrThrow: jest.fn().mockRejectedValue(new Error("stop here")) } };
      const service = new ProvisionUserService(prisma as any);

      // Getting as far as the factory lookup proves the role cleared validation.
      await expect(service.provision("factory-a", "someone@example.com", role)).rejects.toThrow("stop here");
      expect(prisma.factory.findUniqueOrThrow).toHaveBeenCalled();
    },
  );

  it("scopes the team listing to one factory", () => {
    const findMany = jest.fn();
    new ProvisionUserService({ appUser: { findMany } } as any).listUsers("factory-a");

    expect(findMany).toHaveBeenCalledWith({
      where: { factoryId: "factory-a" },
      orderBy: { name: "asc" },
    });
  });

  // GAP (documented, not enforced): provision() takes no actor, so it cannot
  // tell an owner from a manager. Nothing at this layer stops a manager from
  // reassigning an existing owner's role — only the controller's
  // @Roles("owner", "admin") gate stands in the way, and it treats both the
  // same. ston3gpt passes the actor role in and blocks owner demotion here.
  it("takes no actor identity, so it cannot protect an existing owner", () => {
    expect(ProvisionUserService.prototype.provision.length).toBe(3);
  });
});
