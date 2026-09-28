import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client";
import { AzureCommunicationService } from "../azure/azure-communication.service";
import { PrismaError } from "../prisma/prisma.constants";
import { PrismaService } from "../prisma/prisma.service";

export const EMAIL_LOGIN_LINK_TTL_MS = 15 * 60 * 1000;
export const EMAIL_LOGIN_COOLDOWN_MS = 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildLoginLinkHtmlEmail(link: string) {
  return `<p>Hei!</p>
<p>Trykk på lenken for å logge inn på Peoply:</p>
<p><a href="${link}">Logg inn på Peoply</a></p>
<p>Lenken virker i 15 minutter og kan bare brukes én gang. Har du ikke bedt om å logge inn, kan du se bort fra denne e-posten.</p>`;
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
    const flag = this.config.get<boolean | string>("EMAIL_LOGIN_ENABLED");
    return flag === true || flag === "true";
  }

  async requestLink(email: string, now = new Date()): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const recent = await this.prisma.loginLink.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(now.getTime() - EMAIL_LOGIN_COOLDOWN_MS) },
      },
    });
    if (recent) return;

    const token = randomBytes(32).toString("base64url");

    await this.prisma.$transaction([
      this.prisma.loginLink.deleteMany({
        where: { OR: [{ userId: user.id }, { expiresAt: { lte: now } }] },
      }),
      this.prisma.loginLink.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() + EMAIL_LOGIN_LINK_TTL_MS),
        },
      }),
    ]);

    void this.sendLink(user.id, user.email, token);
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
      this.config.get<string>("FRONTEND_URL") ?? "https://peoply.app";
    const link = `${frontendUrl}/login/email?token=${token}`;

    try {
      await this.mailer.send({
        senderAddress: "no-reply@peoply.app",
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
