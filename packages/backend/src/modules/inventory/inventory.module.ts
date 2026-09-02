import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { RawBlockController } from "./raw-block.controller";
import { RawBlockService } from "./raw-block.service";
import { SlabController } from "./slab.controller";
import { SlabService } from "./slab.service";
import { InventoryLocationController, InventoryMovementController } from "./inventory-ledger.controller";
import { InventoryLocationService } from "./inventory-location.service";
import { InventoryMovementService } from "./inventory-movement.service";
import { OpeningInventoryController } from "./opening-inventory.controller";
import { OpeningInventoryService } from "./opening-inventory.service";

@Module({
  controllers: [RawBlockController, SlabController, InventoryLocationController, InventoryMovementController, OpeningInventoryController],
  providers: [
    RawBlockService,
    SlabService,
    InventoryLocationService,
    InventoryMovementService,
    OpeningInventoryService,
    PrismaService,
  ],
  // Exported so production sessions can post movements inside their own
  // transactions once they are wired to the ledger.
  exports: [InventoryLocationService, InventoryMovementService],
})
export class InventoryModule {}
