import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ProvisionUserController } from "./provision-user.controller";
import { ProvisionUserService } from "./provision-user.service";

@Module({
  controllers: [ProvisionUserController],
  providers: [ProvisionUserService, PrismaService, RolesGuard],
})
export class AdminModule {}
