import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import { ModerationService } from "./moderation.service";

@Controller("moderation")
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @UseGuards(AuthenticatedGuard)
  @Get("/info/new-users")
  async getNewUsersInTheLastDays(@Query("days") days: number) {
    return this.moderationService.getNumberOfNewUsers(days);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/info/new-events")
  async getNewEventsInTheLastDays(@Query("days") days: number) {
    return this.moderationService.getNumberOfNewEvents(days);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/info/new-orgs")
  async getNewOrgsInTheLastDays(@Query("days") days: number) {
    return this.moderationService.getNumberOfNewOrgs(days);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/info/new-registrations")
  async getNewRegistrationsInTheLastDays(@Query("days") days: number) {
    return this.moderationService.getNumberOfNewRegistrations(days);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/info/new-favorites")
  async getNewFavoritesInTheLastDays(@Query("days") days: number) {
    return this.moderationService.getNumberOfNewFavorites(days);
  }
}
