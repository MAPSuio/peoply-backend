import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import { ModeratorGuard } from "../auth/guards/moderator.guard";
import { ModerationRangeDto } from "./dto/moderation-range.dto";
import { ModerationService } from "./moderation.service";

@Controller("moderation")
@UseGuards(AuthenticatedGuard, ModeratorGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get("/info/new-users")
  async getNewUsersInTheLastDays(@Query() { days }: ModerationRangeDto) {
    return this.moderationService.getNumberOfNewUsers(days);
  }

  @Get("/info/new-events")
  async getNewEventsInTheLastDays(@Query() { days }: ModerationRangeDto) {
    return this.moderationService.getNumberOfNewEvents(days);
  }

  @Get("/info/new-orgs")
  async getNewOrgsInTheLastDays(@Query() { days }: ModerationRangeDto) {
    return this.moderationService.getNumberOfNewOrgs(days);
  }

  @Get("/info/new-registrations")
  async getNewRegistrationsInTheLastDays(
    @Query() { days }: ModerationRangeDto,
  ) {
    return this.moderationService.getNumberOfNewRegistrations(days);
  }

  @Get("/info/new-favorites")
  async getNewFavoritesInTheLastDays(@Query() { days }: ModerationRangeDto) {
    return this.moderationService.getNumberOfNewFavorites(days);
  }
}
