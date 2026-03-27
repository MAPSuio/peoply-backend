import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { postDiscordWebhook } from "../threat-detection/discord-webhook";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";

const FEEDBACK_COOLDOWN_MS = 60 * 60 * 1000;

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateFeedbackDto) {
    const cooldownStartedAt = new Date(Date.now() - FEEDBACK_COOLDOWN_MS);

    const latestFeedback = await this.prisma.feedback.findFirst({
      where: {
        userId,
        createdAt: {
          gte: cooldownStartedAt,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (latestFeedback) {
      const retryAt = new Date(
        latestFeedback.createdAt.getTime() + FEEDBACK_COOLDOWN_MS,
      );

      throw new HttpException(
        {
          message: "Du kan sende maks en tilbakemelding per time.",
          retryAt: retryAt.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        userId,
        message: dto.message,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    await this.sendDiscordNotification(dto.message);

    return feedback;
  }

  private async sendDiscordNotification(message: string) {
    const webhookUrl = this.config.get<string>("DISCORD_ALERT_WEBHOOK_URL");

    if (!webhookUrl) {
      return;
    }

    try {
      const res = await postDiscordWebhook(
        webhookUrl,
        JSON.stringify({ content: message }),
      );

      if (res.statusCode < 200 || res.statusCode >= 300) {
        this.logger.error(
          `Feedback Discord webhook responded ${res.statusCode}: ${res.body}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send feedback to Discord: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

export { FEEDBACK_COOLDOWN_MS };
