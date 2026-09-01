import { UnauthorizedException } from "@nestjs/common";
import * as Joi from "joi";
import { AccessSessionService } from "./access-session.service";
import { jwtSecretSchema } from "./jwt-secret.schema";

/* Two independent barriers against a refresh token being accepted as an
   access token. Either alone closes the hole; both are cheap. */
describe("access/refresh token confusion", () => {
  describe("the config schema keeps the two secrets apart", () => {
    /* The real rule AppModule spreads into its validationSchema, not a copy
       of it - so loosening it there fails here. */
    const schema = Joi.object(jwtSecretSchema);

    it("rejects identical secrets", () => {
      const { error } = schema.validate({
        JWT_ACCESS_TOKEN_SECRET: "change-me",
        JWT_REFRESH_TOKEN_SECRET: "change-me",
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("JWT_REFRESH_TOKEN_SECRET");
    });

    it("accepts distinct secrets", () => {
      const { error } = schema.validate({
        JWT_ACCESS_TOKEN_SECRET: "access-secret",
        JWT_REFRESH_TOKEN_SECRET: "refresh-secret",
      });

      expect(error).toBeUndefined();
    });
  });

  describe("AccessSessionService rejects a refresh payload", () => {
    const SESSION_ID = "session-1";
    const user = { id: "user-1", refreshTokenId: SESSION_ID };

    const jwtService = { verify: jest.fn() } as any;
    const usersService = { findById: jest.fn() } as any;

    let accessSession: AccessSessionService;

    beforeEach(() => {
      jest.clearAllMocks();
      usersService.findById.mockResolvedValue(user);
      accessSession = new AccessSessionService(jwtService, usersService);
    });

    it("refuses a payload carrying tokenId", async () => {
      /* What getRefreshToken signs. Only the secret used to be in the way. */
      await expect(
        accessSession.userFromPayload({
          sub: "user-1",
          sid: SESSION_ID,
          tokenId: "refresh-id",
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it("refuses it even when tokenId is null", async () => {
      /* refreshTokenId is nullable, so a user who never refreshed gets
         tokenId: null - present, and still not an access token. */
      await expect(
        accessSession.userFromPayload({
          sub: "user-1",
          sid: SESSION_ID,
          tokenId: null,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("still accepts a real access payload", async () => {
      await expect(
        accessSession.userFromPayload({ sub: "user-1", sid: SESSION_ID }),
      ).resolves.toEqual(user);
    });

    it("still rejects an access payload for a deleted user", async () => {
      usersService.findById.mockResolvedValueOnce(null);

      await expect(
        accessSession.userFromPayload({ sub: "gone", sid: SESSION_ID }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
