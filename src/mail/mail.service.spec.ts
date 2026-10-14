import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { BUDGET_ACTIONS } from "../abuse-budget/budget-action";
import { BudgetExceeded } from "../abuse-budget/budget-errors";
import { InMemoryBudgetStore } from "../abuse-budget/in-memory-budget-store";
import { runWithRequest } from "../abuse-budget/principal-context";
import { MailService } from "./mail.service";

const batchSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ batch: { send: batchSend } })),
}));

const MAIL_LIMIT = BUDGET_ACTIONS["mail.recipient"].limit;
const ARRANGER = { headers: {}, ip: "203.0.113.8", user: { id: "arranger-1" } };

function addresses(count: number, prefix = "member") {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${index}@example.com`,
  );
}

function mailTo(to: string[]) {
  return { to, subject: "subject", html: "<p>body</p>" };
}

function buildService(
  apiKey: string | undefined = "re_test",
  frontendUrl?: string,
) {
  const budget = new AbuseBudgetService(new InMemoryBudgetStore(), {
    now: () => 0,
  });
  const env: Record<string, string | undefined> = {
    RESEND_API_KEY: apiKey,
    FRONTEND_URL: frontendUrl,
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;

  return { service: new MailService(config, budget), budget };
}

beforeEach(() => {
  batchSend.mockReset();
  batchSend.mockImplementation(async (emails: unknown[]) => ({
    data: { data: emails.map((_, index) => ({ id: `msg-${index}` })) },
    error: null,
  }));
});

describe("MailService", () => {
  it("sends one email per recipient from the no-reply address", async () => {
    const { service } = buildService();

    await service.send({
      to: ["a@example.com", "b@example.com"],
      subject: "Hei",
      html: "<p>body</p>",
      replyTo: "arranger@example.com",
    });

    expect(batchSend.mock.calls[0][0]).toEqual([
      {
        from: "Peoply <no-reply@peoply.app>",
        to: "a@example.com",
        subject: "Hei",
        html: expect.stringContaining("<p>body</p>"),
        replyTo: "arranger@example.com",
      },
      {
        from: "Peoply <no-reply@peoply.app>",
        to: "b@example.com",
        subject: "Hei",
        html: expect.stringContaining("<p>body</p>"),
        replyTo: "arranger@example.com",
      },
    ]);
  });

  it("signs every email from the Peoply team above the fine print", async () => {
    const { service } = buildService();

    await service.send({
      ...mailTo(["a@example.com"]),
      footer: "<p>fine print</p>",
    });

    const html: string = batchSend.mock.calls[0][0][0].html;
    const order = ["<p>body</p>", "Mvh", "Peoply-teamet", "<p>fine print</p>"];
    const positions = order.map((part) => html.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const asset of ["background.png", "peoply.png", "maps.png"]) {
      expect(html).toContain(`https://peoply.app/email/${asset}`);
    }
  });

  it("loads the artwork from the configured frontend", async () => {
    const { service } = buildService("re_test", "https://staging.peoply.app");

    await service.send(mailTo(["a@example.com"]));

    const html: string = batchSend.mock.calls[0][0][0].html;
    expect(html).toContain("https://staging.peoply.app/email/peoply.png");
    expect(html).not.toContain("https://peoply.app/email/");
  });

  it("returns the id of the first email", async () => {
    const { service } = buildService();

    await expect(service.send(mailTo(["a@example.com"]))).resolves.toEqual({
      id: "msg-0",
    });
  });

  it("splits a large audience into batches of 100", async () => {
    const { service } = buildService();

    await service.send(mailTo(addresses(250)));

    expect(
      batchSend.mock.calls.map(([emails]) => (emails as unknown[]).length),
    ).toEqual([100, 100, 50]);
  });

  it("mails an address once, however often it is listed", async () => {
    const { service } = buildService();

    await service.send(mailTo(["a@example.com", "a@example.com"]));

    expect(batchSend.mock.calls[0][0]).toHaveLength(1);
  });

  it("sends nothing for an empty audience", async () => {
    const { service } = buildService();

    await expect(service.send(mailTo([]))).resolves.toBeNull();
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("resolves without an id when Resend rejects the batch", async () => {
    const { service } = buildService();
    batchSend.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "bad sender" },
    });

    await expect(service.send(mailTo(["a@example.com"]))).resolves.toBeNull();
  });

  it("keeps the first batch's id and stops when a later batch fails", async () => {
    const { service } = buildService();
    batchSend.mockImplementationOnce(async () => ({
      data: { data: [{ id: "msg-0" }] },
      error: null,
    }));
    batchSend.mockResolvedValueOnce({
      data: null,
      error: { name: "application_error", message: "Unable to fetch data." },
    });

    await expect(service.send(mailTo(addresses(250)))).resolves.toEqual({
      id: "msg-0",
    });
    expect(batchSend).toHaveBeenCalledTimes(2);
  });

  it("logs a failure without the recipient's address", async () => {
    const { service } = buildService();
    const logged = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    batchSend.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "a@example.com is invalid" },
    });

    await service.send(mailTo(["a@example.com"]));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).not.toContain("a@example.com");
    logged.mockRestore();
  });

  it("gives every Resend request a deadline", async () => {
    const { service } = buildService();

    await service.send(mailTo(addresses(150)));

    for (const [, options] of batchSend.mock.calls) {
      expect(options).toEqual({ signal: expect.any(AbortSignal) });
    }
    expect(batchSend).toHaveBeenCalledTimes(2);
  });

  it("sends and spends nothing without an API key", async () => {
    const { service, budget } = buildService("");
    const consume = jest.spyOn(budget, "consume");

    await runWithRequest(ARRANGER, async () => {
      await expect(service.send(mailTo(["a@example.com"]))).resolves.toBeNull();
    });

    expect(batchSend).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it("charges the caller once per recipient", async () => {
    const { service } = buildService();

    await runWithRequest(ARRANGER, async () => {
      await service.send(mailTo(addresses(MAIL_LIMIT)));

      await expect(
        service.send(mailTo(["one-more@example.com"])),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(batchSend).toHaveBeenCalledTimes(Math.ceil(MAIL_LIMIT / 100));
  });

  it("refuses the message that would cross the limit rather than truncating it", async () => {
    const { service } = buildService();

    await runWithRequest(ARRANGER, async () => {
      await expect(
        service.send(mailTo(addresses(MAIL_LIMIT + 1))),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(batchSend).not.toHaveBeenCalled();
  });

  it("keeps two arrangers on separate allowances", async () => {
    const { service } = buildService();

    await runWithRequest(ARRANGER, () =>
      service.send(mailTo(addresses(MAIL_LIMIT))),
    );

    await runWithRequest(
      { headers: {}, ip: "203.0.113.9", user: { id: "arranger-2" } },
      async () => {
        await expect(
          service.send(mailTo(["member@example.com"])),
        ).resolves.toEqual({ id: "msg-0" });
      },
    );
  });

  it("lets the scheduled feed mailer through, since no caller asked for it", async () => {
    const { service } = buildService();

    await expect(
      service.send(mailTo(addresses(MAIL_LIMIT + 10, "admin"))),
    ).resolves.toEqual({ id: "msg-0" });
  });
});
