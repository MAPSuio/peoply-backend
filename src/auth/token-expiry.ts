import { ConfigService } from "@nestjs/config";

/**
 * Reads a JWT lifetime, in seconds, out of config.
 *
 * `@nestjs/jwt` v11 types `expiresIn` as `number | ms.StringValue`, and that
 * is what surfaced this: both call sites used to build the value as
 * `` `${configService.get(key)}s` ``, which quietly produces the literal
 * string `"undefineds"` when the variable is missing. `jsonwebtoken` rejects
 * that when it signs, so a misconfigured deploy would have booted happily and
 * then failed on the first login instead of at startup.
 *
 * The Joi schema in `app.module.ts` already marks these `required()` numbers,
 * so in a correctly configured process this cannot trigger. It is here to keep
 * the failure at boot if that schema and these reads ever drift apart.
 *
 * `jsonwebtoken` reads a bare number as seconds, which is exactly what the
 * old `${n}s` template meant, so token lifetimes are unchanged.
 */
export const getTokenExpirySeconds = (
  configService: ConfigService,
  key: string,
): number => {
  const seconds = Number(configService.get(key));

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`${key} must be a positive number of seconds`);
  }

  return seconds;
};
