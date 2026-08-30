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

  it("refuses a pepper equal to the session secret", () => {
    const secret = "b".repeat(MCP_KEY_PEPPER_MIN_LENGTH);
    const { error } = Joi.object({
      SESSION_SECRET: Joi.string().required(),
      ...mcpKeyPepperSchema,
    }).validate({ SESSION_SECRET: secret, MCP_KEY_PEPPER: secret });

    expect(error?.message).toContain("MCP_KEY_PEPPER");
  });
});
