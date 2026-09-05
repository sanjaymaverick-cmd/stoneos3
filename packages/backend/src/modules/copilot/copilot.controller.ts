import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { CopilotService, CopilotAnswer } from "./copilot.service";
import { CopilotReadinessService } from "./copilot-readiness.service";

@Controller("copilot")
@UseGuards(SessionAuthGuard, RolesGuard)
export class CopilotController {
  constructor(private service: CopilotService, private readiness: CopilotReadinessService) {}

  // Owner only — narrower than the dashboard/admin "owner or admin" pattern
  // elsewhere in this codebase. This was the Owner's explicit choice, not
  // an oversight — see the brief.
  @Post("ask")
  @Roles("owner")
  ask(@CurrentUser() user: AuthenticatedUser, @Body() body: { question?: string }): Promise<CopilotAnswer> {
    const question = body?.question?.trim();
    if (!question) {
      throw new BadRequestException("question is required");
    }
    return this.service.ask(user.factoryId, user.id, question, this.readiness.ready);
  }
}
