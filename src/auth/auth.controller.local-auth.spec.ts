import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/services";

/**
 * `GET /auth/dev-users` and `GET /auth/dev-login?email=…` are gated by the same
 * `assertLocalAuthRequest`. The login one mints a session for whichever account
 * is named, with no password, so the gate is the whole of its access control.
 */
describe("AuthController local auth gate", () => {
  const usersService = {
    findForLocalAuth: jest.fn().mockResolvedValue([{ id: "u1" }]),
  } as unknown as UsersService;

  const buildController = (localAuthEnabled: boolean) =>
    new AuthController(
      {} as AuthService,
      {
        get: (key: string) =>
          key === "LOCAL_AUTH_ENABLED" ? localAuthEnabled : undefined,
      } as unknown as ConfigService,
      usersService,
    );

  const request = ({
    remoteAddress,
    host,
    origin,
  }: {
    remoteAddress?: string;
    host?: string;
    origin?: string;
  }) =>
    ({
      socket: { remoteAddress },
      hostname: host,
      headers: { host, ...(origin ? { origin } : {}) },
    }) as unknown as Request;

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("serves a genuinely local request", async () => {
    await expect(
      buildController(true).localAuthUsers(
        request({ remoteAddress: "127.0.0.1", host: "localhost" }),
      ),
    ).resolves.toEqual({ users: [{ id: "u1" }] });
  });

  it("serves a local request arriving over IPv6 loopback", async () => {
    await expect(
      buildController(true).localAuthUsers(
        request({ remoteAddress: "::1", host: "localhost" }),
      ),
    ).resolves.toBeDefined();
  });

  it("rejects a remote request that forges the Host header", async () => {
    // The gate used to read req.hostname, which is the Host header (or
    // X-Forwarded-Host, since the app sets trust proxy). Both are written by
    // the caller, so this request passed:
    //   curl -H "Host: localhost" https://<staging>/auth/dev-login?email=…
    await expect(
      buildController(true).localAuthUsers(
        request({ remoteAddress: "203.0.113.7", host: "localhost" }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects a remote request that forges both Host and Origin", async () => {
    await expect(
      buildController(true).localAuthUsers(
        request({
          remoteAddress: "203.0.113.7",
          host: "localhost",
          origin: "http://localhost:3001",
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects a request with no peer address rather than assuming local", async () => {
    await expect(
      buildController(true).localAuthUsers(
        request({ remoteAddress: undefined, host: "localhost" }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("still requires the feature flag even from loopback", async () => {
    await expect(
      buildController(false).localAuthUsers(
        request({ remoteAddress: "127.0.0.1", host: "localhost" }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("is off in production even from loopback with the flag on", async () => {
    process.env.NODE_ENV = "production";

    await expect(
      buildController(true).localAuthUsers(
        request({ remoteAddress: "127.0.0.1", host: "localhost" }),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
