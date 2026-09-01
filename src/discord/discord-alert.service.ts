import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { postDiscordWebhook } from "./discord-webhook";
import { MentionCooldown } from "./mention-cooldown";

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/**
 * Discord's documented embed limits. Exceed any one of them and the webhook
 * answers 400 and posts nothing.
 *
 * That matters here because the fields carry attacker-controlled data — the
 * request path, above all. A prober whose URLs are a couple of thousand
 * characters long would have produced an over-long field value on every alert,
 * so every alert would have been rejected, and the only trace would have been
 * a "Discord webhook responded 400" line in a log nobody reads. Suppressing
 * the alerting is a cheap first move for an attacker, and it cost one long URL.
 */
const DISCORD_LIMITS = {
  title: 256,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  total: 6000,
} as const;

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function fieldSize(field: EmbedField) {
  return field.name.length + field.value.length;
}

/**
 * Cuts an embed down to something Discord will accept: each part to its own
 * limit, then whole fields off the end until the total fits.
 */
export function clampEmbed(title: string, fields: EmbedField[]) {
  const clampedTitle = truncate(title, DISCORD_LIMITS.title);

  const clampedFields = fields.slice(0, DISCORD_LIMITS.fields).map((field) => ({
    ...field,
    name: truncate(field.name, DISCORD_LIMITS.fieldName),
    value: truncate(field.value, DISCORD_LIMITS.fieldValue),
  }));

  let total =
    clampedTitle.length +
    clampedFields.reduce((sum, field) => sum + fieldSize(field), 0);

  while (clampedFields.length > 0 && total > DISCORD_LIMITS.total) {
    total -= fieldSize(clampedFields.pop() as EmbedField);
  }

  return { title: clampedTitle, fields: clampedFields };
}

@Injectable()
export class DiscordAlertService implements OnModuleInit {
  private readonly logger = new Logger(DiscordAlertService.name);
  private webhookUrl: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly mentionCooldown: MentionCooldown,
  ) {}

  onModuleInit() {
    this.webhookUrl = this.config.get<string>("DISCORD_ALERT_WEBHOOK_URL");
    if (!this.webhookUrl) {
      this.logger.warn(
        "DISCORD_ALERT_WEBHOOK_URL not set — alerts will only be logged locally",
      );
    }
  }

  /** Whether a webhook is configured; callers that log their own fallback read this. */
  get isConfigured() {
    return !!this.webhookUrl;
  }

  async sendAlert(
    title: string,
    fields: EmbedField[],
    color = 0xff0000,
  ): Promise<void> {
    /* Logged as well as posted so the notice survives a Discord outage.
       `log`, not `warn`: what is left calling this is a feedback submission
       and an organization awaiting approval. Neither is a fault. */
    this.logger.log(
      `${title} | ${fields.map((f) => `${f.name}: ${f.value}`).join(", ")}`,
    );

    await this.send({ title, fields, color, context: "Discord alert" });
  }

  /**
   * Posts one embed to the alert webhook. Failures are logged, never thrown —
   * a Discord outage must not fail the request that triggered the message.
   * Mentions are opt-in per message via `content`.
   */
  async send({
    title,
    fields = [],
    color,
    description,
    content,
    context = "Discord message",
  }: {
    title: string;
    fields?: EmbedField[];
    color: number;
    description?: string;
    content?: string;
    context?: string;
  }): Promise<void> {
    if (!this.webhookUrl) return;

    const embed = clampEmbed(title, fields);
    const mentions =
      content && (await this.mentionCooldown.mayMention())
        ? { parse: ["everyone"] }
        : { parse: [] };

    const body = JSON.stringify({
      ...(content ? { content, allowed_mentions: mentions } : {}),
      embeds: [
        {
          title: embed.title,
          color,
          description,
          fields: embed.fields,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    try {
      const res = await postDiscordWebhook(this.webhookUrl, body);

      if (res.statusCode < 200 || res.statusCode >= 300) {
        this.logger.error(
          `${context} webhook responded ${res.statusCode}: ${res.body}`,
        );
        return;
      }

      this.logger.log(`${context} sent: ${title}`);
    } catch (err) {
      this.logger.error(
        `Failed to send ${context}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
