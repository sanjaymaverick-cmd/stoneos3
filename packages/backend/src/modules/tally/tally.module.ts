import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { TallyImportController } from "./tally-import.controller";
import { TallyImportService, TallyParserService } from "./tally-import.service";

@Module({
  controllers: [TallyImportController],
  providers: [TallyImportService, TallyParserService, PrismaService],
})
export class TallyModule {}
