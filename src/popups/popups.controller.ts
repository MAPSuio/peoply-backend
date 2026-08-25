import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { BROWSER_CACHE_TTL, BrowserCacheFor } from "../util/browser-cache";
import { AuthenticatedGuard } from "../auth/guards";
import { AdministrationService } from "../administration/administration.service";
import { CreatePopupDto } from "./dto/create-popup.dto";
import { UpdatePopupDto } from "./dto/update-popup.dto";
import { PopupsService } from "./popups.service";

@Controller("popups")
export class PopupsController {
  constructor(
    private readonly popupsService: PopupsService,
    private readonly administrationService: AdministrationService,
  ) {}

  @Get("active")
  @BrowserCacheFor(BROWSER_CACHE_TTL.scheduledContent)
  findActive() {
    return this.popupsService.findActive();
  }

  @UseGuards(AuthenticatedGuard)
  @Get()
  async findAll(@Req() req: any) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.popupsService.findAll();
  }

  @UseGuards(AuthenticatedGuard)
  @Post()
  async create(@Req() req: any, @Body() dto: CreatePopupDto) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.popupsService.create(dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Patch(":popupId")
  async update(
    @Req() req: any,
    @Param("popupId", ParseUUIDPipe) popupId: string,
    @Body() dto: UpdatePopupDto,
  ) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.popupsService.update(popupId, dto);
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(":popupId")
  @HttpCode(204)
  async remove(
    @Req() req: any,
    @Param("popupId", ParseUUIDPipe) popupId: string,
  ) {
    await this.administrationService.ensureAdmin(req.user.id);
    await this.popupsService.remove(popupId);
  }
}
