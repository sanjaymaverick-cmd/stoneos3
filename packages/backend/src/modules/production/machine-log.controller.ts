import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { PRODUCTION_INPUT_ROLES } from "../../common/role-policy";
import { MachineLogService } from "./machine-log.service";

@Controller("machines/:machineId/log")
@UseGuards(ClerkAuthGuard, RolesGuard)
export class MachineLogController {
  constructor(private service: MachineLogService) {}

  @Post()
  @Roles(...PRODUCTION_INPUT_ROLES)
  upsert(@CurrentUser() user: AuthenticatedUser, @Param("machineId") machineId: string, @Body() body: any) {
    const { logDate, ...fields } = body;
    return this.service.upsert(user.factoryId, machineId, logDate, fields);
  }
}
