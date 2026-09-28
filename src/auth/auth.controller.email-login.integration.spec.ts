import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { UsersService } from "../users/services";
import { AccessSessionService } from "./access-session.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailLoginService } from "./email-login.service";
import { RefreshGuard, VippsGuard } from "./guards";
import { GoogleGuard } from "./guards/google.guard";

describe("email login routes over HTTP", () => {
  const trustedOrigin = "https://peoply.test";
  const validToken = "a".repeat(43);

  const emailLogin = {
    isEnabled: jest.fn(() => true),
    requestLinkInBackground: jest.fn(),
    consume: jest.fn(),
  };
  const usersService = { ensureRefreshTokenId: jest.fn() };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: JwtService, useValue: new JwtService({ secret: "test" }) },
        {
          provide: ConfigService,
          useValue: new ConfigService({ CORS_ORIGIN: trustedOrigin }),
        },
        { provide: UsersService, useValue: usersService },
        { provide: AccessSessionService, useValue: {} },
        { provide: EmailLoginService, useValue: emailLogin },
      ],
    })
      .overrideGuard(GoogleGuard)
      .useValue({})
      .overrideGuard(VippsGuard)
      .useValue({})
      .overrideGuard(RefreshGuard)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /auth/email/request", () => {
    it.each([
      ["a missing email", {}],
      ["a malformed email", { email: "not-an-email" }],
      ["a non-string email", { email: 42 }],
      ["an overlong email", { email: `${"a".repeat(250)}@example.com` }],
    ])("rejects %s before asking for a link", async (_, body) => {
      await request(app.getHttpServer())
        .post("/auth/email/request")
        .set("Origin", trustedOrigin)
        .send(body)
        .expect(400);

      expect(emailLogin.requestLinkInBackground).not.toHaveBeenCalled();
    });

    it("refuses an untrusted origin before asking for a link", async () => {
      await request(app.getHttpServer())
        .post("/auth/email/request")
        .set("Origin", "https://evil.example")
        .send({ email: "person@example.com" })
        .expect(403);

      expect(emailLogin.requestLinkInBackground).not.toHaveBeenCalled();
    });

    it("refuses a request with no origin", async () => {
      await request(app.getHttpServer())
        .post("/auth/email/request")
        .send({ email: "person@example.com" })
        .expect(403);

      expect(emailLogin.requestLinkInBackground).not.toHaveBeenCalled();
    });

    it("accepts a trusted request with the trimmed address", async () => {
      await request(app.getHttpServer())
        .post("/auth/email/request")
        .set("Origin", trustedOrigin)
        .send({ email: "  person@example.com " })
        .expect(202);

      expect(emailLogin.requestLinkInBackground).toHaveBeenCalledWith(
        "person@example.com",
      );
    });
  });

  describe("POST /auth/email/verify", () => {
    it.each([
      ["a missing token", {}],
      ["a non-string token", { token: 42 }],
      ["an overlong token", { token: "a".repeat(65) }],
    ])("rejects %s before using any link", async (_, body) => {
      await request(app.getHttpServer())
        .post("/auth/email/verify")
        .set("Origin", trustedOrigin)
        .send(body)
        .expect(400);

      expect(emailLogin.consume).not.toHaveBeenCalled();
    });

    it("refuses an untrusted origin before using the link or setting cookies", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/email/verify")
        .set("Origin", "https://evil.example")
        .send({ token: validToken })
        .expect(403);

      expect(emailLogin.consume).not.toHaveBeenCalled();
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("sets no cookies for a link that does not work", async () => {
      emailLogin.consume.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post("/auth/email/verify")
        .set("Origin", trustedOrigin)
        .send({ token: validToken })
        .expect(401);

      expect(usersService.ensureRefreshTokenId).not.toHaveBeenCalled();
      expect(response.headers["set-cookie"]).toBeUndefined();
    });
  });
});
