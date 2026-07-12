import { Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ClerkAuthGuard } from "../../common/guards/clerk-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { TallyImportService } from "./tally-import.service";

@Controller("tally-import")
@UseGuards(ClerkAuthGuard)
export class TallyImportController {
  constructor(private service: TallyImportService) {}

  @Get("batches")
  findBatches(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findBatches(user.factoryId);
  }

  @Post("daybook")
  @UseInterceptors(FileInterceptor("file"))
  importDaybook(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded — field name must be 'file'");
    return this.service.importDaybook(user.factoryId, file.buffer, file.originalname);
  }

  @Post("trial-balance")
  @UseInterceptors(FileInterceptor("file"))
  importTrialBalance(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded — field name must be 'file'");
    return this.service.importTrialBalance(user.factoryId, file.buffer, file.originalname);
  }

  @Get("item-cross-check")
  itemCrossCheck(@CurrentUser() user: AuthenticatedUser, @Query("from") from: string, @Query("to") to: string) {
    if (!from || !to) throw new BadRequestException("Both 'from' and 'to' query params are required (YYYY-MM-DD)");
    return this.service.itemCrossCheck(user.factoryId, from, to);
  }
}
