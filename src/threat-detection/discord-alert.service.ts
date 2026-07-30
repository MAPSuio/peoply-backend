import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { postDiscordWebhook } from "./discord-webhook";

interface EmbedField {
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

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.webhookUrl = this.config.get<string>("DISCORD_ALERT_WEBHOOK_URL");
    if (!this.webhookUrl) {
      this.logger.warn(
        "DISCORD_ALERT_WEBHOOK_URL not set — alerts will only be logged locally",
      );
    }
  }

  async sendAlert(
    title: string,
    fields: EmbedField[],
    color = 0xff0000,
  ): Promise<void> {
    this.logger.warn(
      `THREAT: ${title} | ${fields
        .map((f) => `${f.name}: ${f.value}`)
        .join(", ")}`,
    );

    if (!this.webhookUrl) return;

    const embed = clampEmbed(title, fields);

    const body = JSON.stringify({
      embeds: [
        {
          title: embed.title,
          color,
          fields: embed.fields,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    try {
      const res = await postDiscordWebhook(this.webhookUrl, body);

      if (res.statusCode < 200 || res.statusCode >= 300) {
        this.logger.error(
          `Discord webhook responded ${res.statusCode}: ${res.body}`,
        );
        return;
      }

      this.logger.log(`Discord alert sent: ${title}`);
    } catch (err) {
      this.logger.error(
        `Failed to send Discord alert: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
