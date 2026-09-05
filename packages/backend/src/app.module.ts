import { Module } from "@nestjs/common";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ProductionModule } from "./modules/production/production.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { TallyModule } from "./modules/tally/tally.module";
import { AdminModule } from "./modules/admin/admin.module";
import { CopilotModule } from "./modules/copilot/copilot.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PrismaService } from "./common/prisma.service";
import { HealthController } from "./health.controller";

@Module({
  imports: [AuthModule, InventoryModule, ProductionModule, SalesModule, ExpensesModule, TallyModule, AdminModule, CopilotModule],
  // HealthController lives at the app root rather than in a feature module —
  // it probes the process and the database, not any one domain. PrismaService
  // is provided here for it; feature modules still provide their own.
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
