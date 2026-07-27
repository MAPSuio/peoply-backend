import { RequestTimeoutException, Logger } from "@nestjs/common";
import { AzureCommunicationService } from "./azure-communication.service";

/** Mirrors the constant in azure-communication.service.ts. */
const AZURE_EMAIL_TIMEOUT_MS = 15_000;

describe("AzureCommunicationService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("returns null when email sending is not configured", async () => {
    const service = new AzureCommunicationService({
      get: jest.fn().mockReturnValue(undefined),
    } as any);

    await expect(service.send({} as any)).resolves.toBeNull();
  });

  it("returns Azure's send result when the SDK responds in time", async () => {
    const service = new AzureCommunicationService({
      get: jest.fn().mockReturnValue(undefined),
    } as any);
    const result = { messageId: "message-123" } as any;

    (service as any).client = {
      send: jest.fn().mockResolvedValue(result),
    };

    await expect(service.send({} as any)).resolves.toBe(result);
  });

  it("times out when the Azure email SDK never resolves", async () => {
    const service = new AzureCommunicationService({
      get: jest.fn().mockReturnValue(undefined),
    } as any);

    (service as any).client = {
      send: jest.fn().mockReturnValue(new Promise(() => undefined)),
    };

    const pending = service.send({} as any);
    const timeoutExpectation = expect(pending).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );

    await jest.advanceTimersByTimeAsync(AZURE_EMAIL_TIMEOUT_MS);

    await timeoutExpectation;
  });
});
