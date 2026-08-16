import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DiscordAlertService } from "../discord/discord-alert.service";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";

const FEEDBACK_COOLDOWN_MS = 60 * 60 * 1000;

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordAlert: DiscordAlertService,
  ) {}

  async create(userId: string, dto: CreateFeedbackDto) {
    const cooldownStartedAt = new Date(Date.now() - FEEDBACK_COOLDOWN_MS);

    /* Reading the last feedback and writing the new one were two separate
       statements, so concurrent requests all saw an empty window and all
       wrote - each one posting to Discord. The cooldown only means anything
       if the check and the insert cannot interleave, so both go inside one
       transaction behind a row lock on the author. */
    const feedback = await this.prisma.$transaction(async (trx) => {
      // Tagged template: `userId` is bound as a parameter, never interpolated.
      await trx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

      const latestFeedback = await trx.feedback.findFirst({
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

      return trx.feedback.create({
        data: {
          userId,
          message: dto.message,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });
    });

    /* Logged here rather than left to the Discord call below, which only logs
       once the webhook has answered and does nothing at all when
       DISCORD_ALERT_WEBHOOK_URL is unset. This line is the record that a
       submission happened, so it has to survive Discord being down.

       Id and timestamp only. The feedback is anonymous by design, so the
       author does not go in the log, and neither does the message: it is
       free text from a user and already stored in the row this id points at. */
    this.logger.log(
      `Feedback received: ${feedback.id} at ${feedback.createdAt.toISOString()}`,
    );

    await this.discordAlert.send({
      title: "Ny anonym feedback",
      description: dto.message,
      color: 0x4a67ff,
      context: "Feedback",
    });

    return feedback;
  }
}

export { FEEDBACK_COOLDOWN_MS };
