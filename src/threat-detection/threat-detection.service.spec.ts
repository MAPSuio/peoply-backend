import { ConfigService } from "@nestjs/config";
import { ThreatDetectionService } from "./threat-detection.service";

describe("ThreatDetectionService", () => {
  const config = {
    get: jest.fn((key: string) => {
      switch (key) {
        case "THREAT_DETECTION_ENABLED":
          return true;
        case "THREAT_ALERT_COOLDOWN_MS":
          return 300000;
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService;

  const discord = {
    sendAlert: jest.fn().mockResolvedValue(undefined),
  };

  let service: ThreatDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ThreatDetectionService(config, discord as any);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it("alerts when traffic reaches 500 requests per minute", () => {
    for (let i = 0; i < 499; i += 1) {
      service.analyzeRequest("GET", `/events/${i}`, 200, "10.0.0.1");
    }

    expect(discord.sendAlert).not.toHaveBeenCalled();

    service.analyzeRequest("GET", "/events/500", 200, "10.0.0.1");

    expect(discord.sendAlert).toHaveBeenCalledWith(
      "High request rate",
      expect.arrayContaining([
        expect.objectContaining({ name: "Requests", value: "500 in the last 60s" }),
      ]),
      0xffff00,
    );
  });

  it("logs earlier warning thresholds for frequent traffic", () => {
    const warnSpy = jest.spyOn((service as any).logger, "warn");

    for (let i = 0; i < 400; i += 1) {
      service.analyzeRequest("GET", `/browse/${i}`, 200, "10.0.0.2");
    }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Elevated request rate: 250 requests in the last 60s"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Elevated request rate: 400 requests in the last 60s"),
    );
  });
});
