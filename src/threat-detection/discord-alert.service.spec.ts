import * as http from "http";
import { ConfigService } from "@nestjs/config";
import { DiscordAlertService } from "./discord-alert.service";

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

    const service = new DiscordAlertService(config);
    service.onModuleInit();

    await service.sendAlert("Threat title", [{ name: "IP", value: "1.2.3.4" }]);

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("Threat title");
    expect(requests[0]).toContain("1.2.3.4");
  });
});
