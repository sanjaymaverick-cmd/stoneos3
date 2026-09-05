// ONE-TIME BOOTSTRAP — run this before anything else works.
//
// Solves the real chicken-and-egg problem: the guarded /admin/users endpoint
// requires an existing owner/admin to call it, but there is no admin on day
// one. This script goes around the API directly (Prisma) to create:
//   1. The Factory row (Vedam Granites)
//   2. B-21 and LPM machines with their real specs
//   3. The first owner — username, password and all
//
// Since the move off Clerk there is no sign-up flow, so this is the ONLY way
// the first credential comes into existence. Everyone else is issued a login
// by the owner through POST /admin/users.
//
// Usage:
//   OWNER_USERNAME=sanjay npx ts-node prisma/bootstrap.ts
//
// Optional: OWNER_PASSWORD (one is generated and printed if you omit it),
// OWNER_NAME, OWNER_EMAIL, FACTORY_NAME.
import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../src/common/password";

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.OWNER_USERNAME ?? "").trim().toLowerCase();
  const factoryName = process.env.FACTORY_NAME ?? "Vedam Granites";
  if (!username) {
    throw new Error("Set OWNER_USERNAME to the login you want for the first owner");
  }

  // A password supplied by hand is used as-is; otherwise one is generated and
  // printed. Either way it is hashed before it touches the database.
  const generated = !process.env.OWNER_PASSWORD;
  const password = process.env.OWNER_PASSWORD || generatePassword(14);

  // Reuse an existing factory of this name rather than creating a duplicate —
  // e.g. a factory row already created ahead of bootstrap (opening-balance/
  // backfill data may already be linked to it, which a second factory row
  // would silently orphan from the owner grant below).
  let factory = await prisma.factory.findFirst({ where: { name: factoryName } });
  if (factory) {
    console.log(`Using existing factory: ${factory.name} (${factory.id})`);
  } else {
    factory = await prisma.factory.create({ data: { name: factoryName } });
    console.log(`Created factory: ${factory.name} (${factory.id})`);
  }

  const existingMachines = await prisma.machine.findMany({ where: { factoryId: factory.id } });
  if (existingMachines.length === 0) {
    await prisma.machine.create({
      data: { factoryId: factory.id, name: "B-21", machineType: "cutting", bladeCount: 21 },
    });
    await prisma.machine.create({
      data: { factoryId: factory.id, name: "LPM", machineType: "polishing", headCount: 16, abrasivesPerHead: 6 },
    });
    console.log("Seeded B-21 (21 blades) and LPM (16 heads x 6 abrasives/head)");
  } else {
    console.log(`Machines already exist for this factory (${existingMachines.map((m) => m.name).join(", ")}) — skipped seeding.`);
  }

  const existingOwner = await prisma.appUser.findUnique({ where: { username } });
  if (existingOwner) {
    // Re-running must not silently reset the owner's password. Say so and stop.
    console.log(`User "${username}" already exists — leaving their credentials alone.`);
    console.log(`If you need a new password, use the owner's own reset, or delete the row and re-run.`);
    return;
  }

  await prisma.appUser.create({
    data: {
      factoryId: factory.id,
      username,
      name: process.env.OWNER_NAME?.trim() || username,
      email: process.env.OWNER_EMAIL || null,
      role: "owner",
      passwordHash: await hashPassword(password),
    },
  });

  console.log(`Granted "${username}" owner access to ${factory.name}`);
  console.log();
  if (generated) {
    console.log(`  username: ${username}`);
    console.log(`  password: ${password}`);
    console.log();
    console.log("This password is shown ONCE and is not recoverable — only its hash is stored.");
    console.log("Sign in, then change it from the app.");
  } else {
    console.log(`  username: ${username}  (password: the OWNER_PASSWORD you supplied)`);
  }
  console.log();
  console.log(`FACTORY_ID=${factory.id}  (save this — you won't need it day-to-day, but it's handy for scripts)`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
