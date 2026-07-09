import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { ExpenseController } from "./expense.controller";
import { ExpenseService } from "./expense.service";
import { VehicleController } from "./vehicle.controller";
import { VehicleService } from "./vehicle.service";

@Module({
  controllers: [ExpenseController, VehicleController],
  providers: [ExpenseService, VehicleService, PrismaService],
})
export class ExpensesModule {}
