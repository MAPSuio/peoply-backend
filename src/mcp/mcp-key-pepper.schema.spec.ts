import { readFileSync } from "node:fs";
import * as Joi from "joi";
import { MCP_KEY_PEPPER_MIN_LENGTH } from "./mcp.constants";
import { mcpKeyPepperSchema } from "./mcp-key-pepper.schema";

describe("mcpKeyPepperSchema", () => {
  const schema = Joi.object(mcpKeyPepperSchema);

  it("refuses to boot without a pepper", () => {
    const { error } = schema.validate({});

    expect(error?.message).toContain("MCP_KEY_PEPPER");
  });

  it("refuses a pepper shorter than the minimum length", () => {
    const { error } = schema.validate({
      MCP_KEY_PEPPER: "a".repeat(MCP_KEY_PEPPER_MIN_LENGTH - 1),
    });

    expect(error?.message).toContain("MCP_KEY_PEPPER");
  });

  it("accepts a pepper of the minimum length", () => {
    const { error } = schema.validate({
      MCP_KEY_PEPPER: "a".repeat(MCP_KEY_PEPPER_MIN_LENGTH),
    });

    expect(error).toBeUndefined();
  });

  it("refuses a pepper equal to the access token secret", () => {
    const secret = "c".repeat(MCP_KEY_PEPPER_MIN_LENGTH);
    const { error } = Joi.object({
      JWT_ACCESS_TOKEN_SECRET: Joi.string().required(),
      ...mcpKeyPepperSchema,
    }).validate({ JWT_ACCESS_TOKEN_SECRET: secret, MCP_KEY_PEPPER: secret });

    expect(error?.message).toContain("MCP_KEY_PEPPER");
  });

  it("refuses the placeholder shipped in .env.example", () => {
    const placeholder = readFileSync(".env.example", "utf8")
      .split("\n")
      .find((line) => line.startsWith("MCP_KEY_PEPPER="))
      ?.split("=")[1];
    const { error } = schema.validate({ MCP_KEY_PEPPER: placeholder });

    expect(error?.message).toContain("MCP_KEY_PEPPER");
  });

  it("refuses a pepper equal to the session secret", () => {
    const secret = "b".repeat(MCP_KEY_PEPPER_MIN_LENGTH);
    const { error } = Joi.object({
      SESSION_SECRET: Joi.string().required(),
      ...mcpKeyPepperSchema,
    }).validate({ SESSION_SECRET: secret, MCP_KEY_PEPPER: secret });

    expect(error?.message).toContain("MCP_KEY_PEPPER");
  });
});
