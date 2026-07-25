import { ConfigService } from "@nestjs/config";
import { getTokenExpirySeconds } from "./token-expiry";

const configReturning = (value: unknown) =>
  ({ get: () => value }) as unknown as ConfigService;

describe("getTokenExpirySeconds", () => {
  it("returns the configured number of seconds", () => {
    expect(getTokenExpirySeconds(configReturning(3600), "KEY")).toBe(3600);
  });

  it("accepts a numeric string, which is how env vars arrive before Joi coercion", () => {
    expect(getTokenExpirySeconds(configReturning("86400"), "KEY")).toBe(86400);
  });

  /**
   * The regression this helper exists for: the old call sites built the value
   * as `${configService.get(key)}s`, so a missing variable produced the string
   * "undefineds" and jsonwebtoken only rejected it at signing time — on a
   * user's first login, not at boot.
   */
  it("throws when the variable is missing rather than yielding a bad expiry", () => {
    expect(() =>
      getTokenExpirySeconds(configReturning(undefined), "KEY"),
    ).toThrow("KEY must be a positive number of seconds");
  });

  it("throws on a non-numeric value", () => {
    expect(() => getTokenExpirySeconds(configReturning("soon"), "KEY")).toThrow(
      "KEY must be a positive number of seconds",
    );
  });

  it.each([0, -1])("throws on a non-positive lifetime (%s)", (value) => {
    expect(() => getTokenExpirySeconds(configReturning(value), "KEY")).toThrow(
      "KEY must be a positive number of seconds",
    );
  });

  it("names the offending key so a misconfigured deploy is diagnosable", () => {
    expect(() =>
      getTokenExpirySeconds(
        configReturning(undefined),
        "JWT_REFRESH_TOKEN_EXP_TIME",
      ),
    ).toThrow(/JWT_REFRESH_TOKEN_EXP_TIME/);
  });
});
