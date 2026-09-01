import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { FeedbackService } from "./feedback.service";

@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post()
  async create(@Req() req: any, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(req.user.id, dto);
  }
}
