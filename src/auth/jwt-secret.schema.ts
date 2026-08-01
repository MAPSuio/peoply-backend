import * as Joi from "joi";

/**
 * Nothing but the secret separates an access token from a refresh token: both
 * carry `sub`, and AccessStrategy verifies with the access secret and then
 * trusts whatever verified. Set the two to the same value and a 30-day refresh
 * token is a valid access token, accepted by every guard.
 *
 * Refusing to boot is the only place this can be caught for certain, so it
 * lives here rather than inline in AppModule - a spec can then hold the real
 * rule instead of a copy of it.
 */
export const jwtSecretSchema = {
  JWT_ACCESS_TOKEN_SECRET: Joi.string().required(),
  JWT_REFRESH_TOKEN_SECRET: Joi.string()
    .required()
    .invalid(Joi.ref("JWT_ACCESS_TOKEN_SECRET"))
    .messages({
      "any.invalid":
        "JWT_REFRESH_TOKEN_SECRET must differ from JWT_ACCESS_TOKEN_SECRET",
    }),
};
