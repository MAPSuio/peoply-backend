import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client";
import { AzureCommunicationService } from "../azure/azure-communication.service";
import { PrismaError } from "../prisma/prisma.constants";
import { PrismaService } from "../prisma/prisma.service";
import { NO_REPLY_ADDRESS } from "../util/email";
import { DEFAULT_FRONTEND_URL } from "../util/url";

export const EMAIL_LOGIN_LINK_TTL_MINUTES = 15;
export const EMAIL_LOGIN_LINK_TTL_MS = EMAIL_LOGIN_LINK_TTL_MINUTES * 60 * 1000;
export const EMAIL_LOGIN_COOLDOWN_MS = 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildLoginLinkHtmlEmail(link: string) {
  return `<p>Hei!</p>
<p>Trykk på lenken for å logge inn på Peoply:</p>
<p><a href="${link}">Logg inn på Peoply</a></p>
<p>Lenken virker i ${EMAIL_LOGIN_LINK_TTL_MINUTES} minutter og kan bare brukes én gang. Har du ikke bedt om å logge inn, kan du se bort fra denne e-posten.</p>`;
}

@Injectable()
export class EmailLoginService {
  private readonly logger = new Logger(EmailLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: AzureCommunicationService,
    private readonly config: ConfigService,
  ) {}

  isEnabled() {
    return this.config.get<boolean>("EMAIL_LOGIN_ENABLED") === true;
  }

  requestLinkInBackground(email: string): void {
    this.requestLink(email).catch((error) => {
      this.logger.error(
        `Login link request failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });
  }

  async requestLink(email: string, now = new Date()): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const token = randomBytes(32).toString("base64url");

    const created = await this.prisma.$transaction(async (trx) => {
      await trx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;

      const recent = await trx.loginLink.findFirst({
        where: {
          userId: user.id,
          createdAt: { gt: new Date(now.getTime() - EMAIL_LOGIN_COOLDOWN_MS) },
        },
      });
      if (recent) return false;

      await trx.loginLink.deleteMany({
        where: { OR: [{ userId: user.id }, { expiresAt: { lte: now } }] },
      });
      await trx.loginLink.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() + EMAIL_LOGIN_LINK_TTL_MS),
        },
      });
      return true;
    });

    if (created) void this.sendLink(user.id, user.email, token);
  }

  async consume(token: string, now = new Date()): Promise<string | null> {
    if (!TOKEN_PATTERN.test(token)) return null;

    try {
      const link = await this.prisma.loginLink.delete({
        where: { tokenHash: hashToken(token) },
      });

      return link.expiresAt > now ? link.userId : null;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        return null;
      }
      throw error;
    }
  }

  private async sendLink(userId: string, address: string, token: string) {
    const frontendUrl =
      this.config.get<string>("FRONTEND_URL") ?? DEFAULT_FRONTEND_URL;
    const link = `${frontendUrl}/login/email?token=${token}`;

    try {
      await this.mailer.send({
        senderAddress: NO_REPLY_ADDRESS,
        recipients: { to: [{ address }] },
        content: {
          subject: "Logg inn på Peoply",
          html: buildLoginLinkHtmlEmail(link),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Login link email for user ${userId} failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
