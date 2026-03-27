import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { postDiscordWebhook } from "./discord-webhook";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
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

    const body = JSON.stringify({
      embeds: [
        {
          title,
          color,
          fields,
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
