import * as http from "node:http";
import { ConfigService } from "@nestjs/config";
import { DiscordAlertService } from "./discord-alert.service";
import { MentionCooldown } from "./mention-cooldown";

const alwaysMentions = () =>
  ({ mayMention: async () => true }) as unknown as MentionCooldown;

const neverMentions = () =>
  ({ mayMention: async () => false }) as unknown as MentionCooldown;

describe("DiscordAlertService", () => {
  it("posts alerts to the configured webhook without fetch", async () => {
    const requests: string[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        requests.push(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(204);
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test webhook server");
    }

    const config = {
      get: jest.fn((key: string) => {
        if (key === "DISCORD_ALERT_WEBHOOK_URL") {
          return `http://127.0.0.1:${address.port}/discord-webhook`;
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new DiscordAlertService(config, alwaysMentions());
    service.onModuleInit();

    await service.sendAlert("Ny tilbakemelding", [
      { name: "IP", value: "1.2.3.4" },
    ]);

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("Ny tilbakemelding");
    expect(requests[0]).toContain("1.2.3.4");
  });
});

describe("pinging the channel", () => {
  async function captureAlert(
    mentionCooldown: MentionCooldown,
  ): Promise<Record<string, unknown>> {
    const requests: string[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push(body);
        res.writeHead(204).end();
      });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test webhook server");
    }

    const config = {
      get: jest.fn((key: string) =>
        key === "DISCORD_ALERT_WEBHOOK_URL"
          ? `http://127.0.0.1:${address.port}/discord-webhook`
          : undefined,
      ),
    } as unknown as ConfigService;

    const service = new DiscordAlertService(config, mentionCooldown);
    service.onModuleInit();

    await service.send({
      title: "Forening rapportert",
      color: 0xffa500,
      content: "@everyone",
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    return JSON.parse(requests[0]);
  }

  it("pings when the channel has not been pinged this hour", async () => {
    const body = await captureAlert(alwaysMentions());

    expect(body.allowed_mentions).toEqual({ parse: ["everyone"] });
  });

  it("still delivers the alert, without the ping, once the hour is spent", async () => {
    const body = await captureAlert(neverMentions());

    expect(body.content).toBe("@everyone");
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds).toHaveLength(1);
  });
});
