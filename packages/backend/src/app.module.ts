import { Module } from "@nestjs/common";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ProductionModule } from "./modules/production/production.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { TallyModule } from "./modules/tally/tally.module";
import { AdminModule } from "./modules/admin/admin.module";

@Module({
  imports: [InventoryModule, ProductionModule, SalesModule, ExpensesModule, TallyModule, AdminModule],
})
export class AppModule {}
