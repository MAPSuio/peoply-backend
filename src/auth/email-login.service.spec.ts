import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client";
import { AzureCommunicationService } from "../azure/azure-communication.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  EMAIL_LOGIN_COOLDOWN_MS,
  EMAIL_LOGIN_LINK_TTL_MS,
  EmailLoginService,
} from "./email-login.service";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const notFound = () =>
  new Prisma.PrismaClientKnownRequestError("not found", {
    code: "P2025",
    clientVersion: "test",
  });

describe("EmailLoginService", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const user = { id: "user-1", email: "person@example.com" };

  let prisma: {
    user: { findUnique: jest.Mock };
    loginLink: {
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let mailer: { send: jest.Mock };
  let config: Record<string, unknown>;
  let service: EmailLoginService;

  const flushMail = () => new Promise((resolve) => setImmediate(resolve));

  const sentToken = () => {
    const html: string = mailer.send.mock.calls[0][0].content.html;
    const match = /token=([A-Za-z0-9_-]+)/.exec(html);
    return match?.[1] ?? "";
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      loginLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
      },
      $transaction: jest.fn((work) => work(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    mailer = { send: jest.fn().mockResolvedValue({ id: "op-1" }) };
    config = {
      EMAIL_LOGIN_ENABLED: true,
      FRONTEND_URL: "https://peoply.app",
    };
    service = new EmailLoginService(
      prisma as unknown as PrismaService,
      mailer as unknown as AzureCommunicationService,
      { get: (key: string) => config[key] } as unknown as ConfigService,
    );
  });

  describe("isEnabled", () => {
    it("is off unless configured", () => {
      config.EMAIL_LOGIN_ENABLED = undefined;
      expect(service.isEnabled()).toBe(false);
    });

    it("is on when the validated config says so", () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe("requestLink", () => {
    it("sends nothing and stores nothing for an unknown email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestLink("nobody@example.com", now);
      await flushMail();

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it("stores only the hash of the token it mails, with a short expiry", async () => {
      await service.requestLink(user.email, now);
      await flushMail();

      const token = sentToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(prisma.loginLink.create).toHaveBeenCalledWith({
        data: {
          tokenHash: sha256(token),
          userId: user.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() + EMAIL_LOGIN_LINK_TTL_MS),
        },
      });
      expect(JSON.stringify(prisma.loginLink.create.mock.calls)).not.toContain(
        token,
      );
    });

    it("replaces only the user's own earlier links", async () => {
      await service.requestLink(user.email, now);

      expect(prisma.loginLink.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      });
    });

    it("mails the frontend login page, to the address on the account", async () => {
      await service.requestLink("PERSON@example.com", now);
      await flushMail();

      const message = mailer.send.mock.calls[0][0];
      expect(message.recipients.to).toEqual([{ address: user.email }]);
      expect(message.content.html).toContain(
        `https://peoply.app/login/email?token=${sentToken()}`,
      );
    });

    it("sends at most one link per cooldown window", async () => {
      prisma.loginLink.findFirst.mockResolvedValue({ userId: user.id });

      await service.requestLink(user.email, now);
      await flushMail();

      expect(prisma.loginLink.findFirst).toHaveBeenCalledWith({
        where: {
          userId: user.id,
          createdAt: { gt: new Date(now.getTime() - EMAIL_LOGIN_COOLDOWN_MS) },
        },
      });
      expect(prisma.loginLink.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it("does not surface a failed send to the caller", async () => {
      mailer.send.mockRejectedValue(new Error("azure down"));

      await expect(
        service.requestLink(user.email, now),
      ).resolves.toBeUndefined();
      await flushMail();
    });
  });

  describe("requestLinkInBackground", () => {
    it("returns before the lookup finishes and logs a failure instead of throwing", async () => {
      let fail: (error: Error) => void = () => {};
      prisma.user.findUnique.mockReturnValue(
        new Promise((_, reject) => {
          fail = reject;
        }),
      );
      const logged = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      expect(service.requestLinkInBackground(user.email)).toBeUndefined();
      fail(new Error("db down"));
      await flushMail();

      expect(logged).toHaveBeenCalledWith("Login link request failed: db down");
      logged.mockRestore();
    });
  });

  describe("consume", () => {
    const token = "a".repeat(43);

    it("returns the user of a live link and deletes it in the same step", async () => {
      prisma.loginLink.delete.mockResolvedValue({
        userId: user.id,
        expiresAt: new Date(now.getTime() + 1000),
      });

      await expect(service.consume(token, now)).resolves.toBe(user.id);
      expect(prisma.loginLink.delete).toHaveBeenCalledWith({
        where: { tokenHash: sha256(token) },
      });
    });

    it("rejects an expired link", async () => {
      prisma.loginLink.delete.mockResolvedValue({
        userId: user.id,
        expiresAt: now,
      });

      await expect(service.consume(token, now)).resolves.toBeNull();
    });

    it("rejects an unknown or already used link", async () => {
      prisma.loginLink.delete.mockRejectedValue(notFound());

      await expect(service.consume(token, now)).resolves.toBeNull();
    });

    it("rejects a malformed token without touching the database", async () => {
      await expect(service.consume("short", now)).resolves.toBeNull();
      expect(prisma.loginLink.delete).not.toHaveBeenCalled();
    });

    it("lets other database errors through", async () => {
      prisma.loginLink.delete.mockRejectedValue(new Error("db down"));

      await expect(service.consume(token, now)).rejects.toThrow("db down");
    });
  });
});
