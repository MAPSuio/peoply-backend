import { UnauthorizedException } from "@nestjs/common";
import * as Joi from "joi";
import { jwtSecretSchema } from "./jwt-secret.schema";
import { AccessStrategy } from "./strategies/access.strategy";

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

  describe("AccessStrategy rejects a refresh payload", () => {
    const userService = { findById: jest.fn() } as any;
    const configService = { get: () => "access-secret" } as any;

    let strategy: AccessStrategy;

    beforeEach(() => {
      jest.clearAllMocks();
      userService.findById.mockResolvedValue({ id: "user-1" });
      strategy = new AccessStrategy(configService, userService);
    });

    it("refuses a payload carrying tokenId", async () => {
      /* What getRefreshToken signs. Only the secret used to be in the way. */
      await expect(
        strategy.validate({ sub: "user-1", tokenId: "refresh-id" }),
      ).rejects.toThrow(UnauthorizedException);

      expect(userService.findById).not.toHaveBeenCalled();
    });

    it("refuses it even when tokenId is null", async () => {
      /* refreshTokenId is nullable, so a user who never refreshed gets
         tokenId: null - present, and still not an access token. */
      await expect(
        strategy.validate({ sub: "user-1", tokenId: null }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("still accepts a real access payload", async () => {
      await expect(strategy.validate({ sub: "user-1" })).resolves.toEqual({
        id: "user-1",
      });
    });

    it("still rejects an access payload for a deleted user", async () => {
      userService.findById.mockResolvedValueOnce(null);

      await expect(strategy.validate({ sub: "gone" })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
