import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ModeratorGuard } from "../auth/guards/moderator.guard";
import { ModerationRangeDto } from "./dto/moderation-range.dto";
import { CountableModel, ModerationService } from "./moderation.service";

/** URL segment → model, so the five counter routes stay one handler. */
const RESOURCE_MODELS: Record<string, CountableModel> = {
  "new-users": "user",
  "new-events": "event",
  "new-orgs": "organization",
  "new-registrations": "registration",
  "new-favorites": "favorite",
};

@Controller("moderation")
@UseGuards(ModeratorGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get("/info/:resource")
  async getNewInTheLastDays(
    @Param("resource") resource: string,
    @Query() { days }: ModerationRangeDto,
  ) {
    const model = RESOURCE_MODELS[resource];
    if (!model) {
      // Same answer an unknown route gave when each counter was its own
      // handler, so the URL surface is unchanged.
      throw new NotFoundException();
    }
    return this.moderationService.countCreatedWithin(model, days);
  }
}
