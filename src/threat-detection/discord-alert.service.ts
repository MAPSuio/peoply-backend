import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

    const body = {
      embeds: [
        {
          title,
          color,
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        this.logger.error(
          `Discord webhook responded ${res.status}: ${await res
            .text()
            .catch(() => "")}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send Discord alert: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
