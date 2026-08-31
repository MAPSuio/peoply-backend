import { ConfigService } from "@nestjs/config";
import { EmailMessage } from "@azure/communication-email";
import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { BUDGET_ACTIONS } from "../abuse-budget/budget-action";
import { BudgetExceeded } from "../abuse-budget/budget-errors";
import { InMemoryBudgetStore } from "../abuse-budget/in-memory-budget-store";
import { runWithRequest } from "../abuse-budget/principal-context";
import { AzureCommunicationService } from "./azure-communication.service";

const MAIL_LIMIT = BUDGET_ACTIONS["mail.recipient"].limit;
const ARRANGER = { headers: {}, ip: "203.0.113.8", user: { id: "arranger-1" } };

function messageTo(...addresses: string[]): EmailMessage {
  return {
    senderAddress: "no-reply@peoply.app",
    recipients: { to: addresses.map((address) => ({ address })) },
    content: { subject: "subject", html: "<p>body</p>" },
  };
}

function buildService() {
  const beginSend = jest.fn().mockResolvedValue(undefined);
  const budget = new AbuseBudgetService(new InMemoryBudgetStore(), {
    now: () => 0,
  });
  const configService = {
    get: () => "endpoint=https://probe.local/;accesskey=cHJvYmU=",
  } as unknown as ConfigService;
  const service = new AzureCommunicationService(configService, budget);

  (service as never as { client: { beginSend: jest.Mock } }).client = {
    beginSend,
  };

  return { service, beginSend };
}

describe("AzureCommunicationService", () => {
  it("charges the caller once per recipient of one message", async () => {
    const { service, beginSend } = buildService();

    await runWithRequest(ARRANGER, async () => {
      for (let sent = 0; sent < MAIL_LIMIT; sent += 1) {
        await service.send(messageTo("member@example.com"));
      }

      await expect(
        service.send(messageTo("member@example.com")),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(beginSend).toHaveBeenCalledTimes(MAIL_LIMIT);
  });

  it("counts everyone a broadcast reaches, not the one call it took", async () => {
    const { service, beginSend } = buildService();
    const audience = Array.from(
      { length: MAIL_LIMIT },
      (_, index) => `member-${index}@example.com`,
    );

    await runWithRequest(ARRANGER, async () => {
      await service.send(messageTo(...audience));

      await expect(
        service.send(messageTo("one-more@example.com")),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(beginSend).toHaveBeenCalledTimes(1);
  });

  it("counts blind copies, which is how the update mail reaches an event", async () => {
    const { service } = buildService();

    await runWithRequest(ARRANGER, async () => {
      await service.send({
        senderAddress: "no-reply@peoply.app",
        recipients: {
          to: [{ address: "no-reply@peoply.app" }],
          bcc: Array.from({ length: MAIL_LIMIT - 1 }, (_, index) => ({
            address: `member-${index}@example.com`,
          })),
        },
        content: { subject: "subject", html: "<p>body</p>" },
      });

      await expect(
        service.send(messageTo("one-more@example.com")),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });
  });

  it("charges one address once, however many recipient lists name it", async () => {
    const { service } = buildService();
    const repeated = "member@example.com";
    const rest = Array.from(
      { length: MAIL_LIMIT - 1 },
      (_, index) => `member-${index}@example.com`,
    );

    await runWithRequest(ARRANGER, async () => {
      await service.send({
        senderAddress: "no-reply@peoply.app",
        recipients: {
          to: [{ address: repeated }],
          cc: [{ address: repeated }],
          bcc: [{ address: repeated }],
        },
        content: { subject: "subject", html: "<p>body</p>" },
      });

      await service.send(messageTo(...rest));

      await expect(
        service.send(messageTo("one-more@example.com")),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });
  });

  it("refuses the message that would cross the limit rather than truncating it", async () => {
    const { service, beginSend } = buildService();
    const audience = Array.from(
      { length: MAIL_LIMIT + 1 },
      (_, index) => `member-${index}@example.com`,
    );

    await runWithRequest(ARRANGER, async () => {
      await expect(service.send(messageTo(...audience))).rejects.toBeInstanceOf(
        BudgetExceeded,
      );
    });

    expect(beginSend).not.toHaveBeenCalled();
  });

  it("keeps two arrangers on separate allowances", async () => {
    const { service } = buildService();
    const audience = Array.from(
      { length: MAIL_LIMIT },
      (_, index) => `member-${index}@example.com`,
    );

    await runWithRequest(ARRANGER, () => service.send(messageTo(...audience)));

    await runWithRequest(
      { headers: {}, ip: "203.0.113.9", user: { id: "arranger-2" } },
      async () => {
        await expect(
          service.send(messageTo("member@example.com")),
        ).resolves.toEqual({ id: expect.any(String) });
      },
    );
  });

  it("lets the scheduled feed mailer through, since no caller asked for it", async () => {
    const { service, beginSend } = buildService();
    const audience = Array.from(
      { length: MAIL_LIMIT + 10 },
      (_, index) => `admin-${index}@example.com`,
    );

    await expect(service.send(messageTo(...audience))).resolves.toEqual({
      id: expect.any(String),
    });
    expect(beginSend).toHaveBeenCalledTimes(1);
  });

  it("spends nothing when sending is disabled", async () => {
    const budget = new AbuseBudgetService(new InMemoryBudgetStore(), {
      now: () => 0,
    });
    const consume = jest.spyOn(budget, "consume");
    const service = new AzureCommunicationService(
      { get: () => undefined } as unknown as ConfigService,
      budget,
    );

    await runWithRequest(ARRANGER, async () => {
      await expect(service.send(messageTo("member@example.com"))).resolves.toBe(
        null,
      );
    });

    expect(consume).not.toHaveBeenCalled();
  });
});
