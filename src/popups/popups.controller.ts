import { Public } from "../auth/public.decorator";
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

  @Public()
  @Get("active")
  @BrowserCacheFor(BROWSER_CACHE_TTL.scheduledContent)
  findActive() {
    return this.popupsService.findActive();
  }

  @Get()
  async findAll(@Req() req: any) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.popupsService.findAll();
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreatePopupDto) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.popupsService.create(dto);
  }

  @Patch(":popupId")
  async update(
    @Req() req: any,
    @Param("popupId", ParseUUIDPipe) popupId: string,
    @Body() dto: UpdatePopupDto,
  ) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.popupsService.update(popupId, dto);
  }

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
