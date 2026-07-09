// Adds B-21 + LPM to an EXISTING factory. For first-time setup (creating
// the factory itself + granting the first owner access), use
// bootstrap.ts instead — this script is for when you add a second
// factory later (e.g. the Andhra/Rajasthan expansion from the original
// vision doc) and just need machines seeded against its factory_id.
// Run with: FACTORY_ID=<id> npx ts-node prisma/seed-machines.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FACTORY_ID = process.env.FACTORY_ID ?? "";

async function main() {
  if (!FACTORY_ID) throw new Error("Set FACTORY_ID env var to the Vedam Granites factory row's id");

  await prisma.machine.create({
    data: { factoryId: FACTORY_ID, name: "B-21", machineType: "cutting", bladeCount: 21 },
  });
  await prisma.machine.create({
    data: { factoryId: FACTORY_ID, name: "LPM", machineType: "polishing", headCount: 16, abrasivesPerHead: 6 },
  });
  console.log("Seeded B-21 (21 blades) and LPM (16 heads x 6 abrasives/head).");
}

main().finally(() => prisma.$disconnect());
