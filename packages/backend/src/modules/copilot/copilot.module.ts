import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { CopilotController } from "./copilot.controller";
import { CopilotService } from "./copilot.service";
import { CopilotReadinessService } from "./copilot-readiness.service";

@Module({
  controllers: [CopilotController],
  providers: [CopilotService, CopilotReadinessService, PrismaService],
})
export class CopilotModule {}
