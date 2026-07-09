import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { MachineLogService } from "./machine-log.service";

@Controller("machines/:machineId/log")
@UseGuards(ClerkAuthGuard)
export class MachineLogController {
  constructor(private service: MachineLogService) {}

  @Post()
  upsert(@Param("machineId") machineId: string, @Body() body: any) {
    const { logDate, ...fields } = body;
    return this.service.upsert(machineId, logDate, fields);
  }
}
