import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { DprController } from "./dpr.controller";
import { DprService } from "./dpr.service";
import { MachineLogController } from "./machine-log.controller";
import { MachineLogService } from "./machine-log.service";
import { MachineController } from "./machine.controller";
import { MachineService } from "./machine.service";
import { CuttingSessionService } from "./cutting-session.service";
import { PolishingSessionService } from "./polishing-session.service";
import { CuttingSessionController, PolishingSessionController } from "./session.controllers";

@Module({
  controllers: [DprController, MachineLogController, MachineController, CuttingSessionController, PolishingSessionController],
  providers: [DprService, MachineLogService, MachineService, CuttingSessionService, PolishingSessionService, PrismaService],
})
export class ProductionModule {}
