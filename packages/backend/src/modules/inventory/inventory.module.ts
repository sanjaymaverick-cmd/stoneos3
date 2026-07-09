import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { RawBlockController } from "./raw-block.controller";
import { RawBlockService } from "./raw-block.service";
import { SlabController } from "./slab.controller";
import { SlabService } from "./slab.service";

@Module({
  controllers: [RawBlockController, SlabController],
  providers: [RawBlockService, SlabService, PrismaService],
})
export class InventoryModule {}
