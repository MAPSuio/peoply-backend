import * as Joi from "joi";
import { MCP_KEY_PEPPER_MIN_LENGTH } from "./mcp.constants";

export const mcpKeyPepperSchema = {
  MCP_KEY_PEPPER: Joi.string()
    .required()
    .min(MCP_KEY_PEPPER_MIN_LENGTH)
    .invalid(Joi.ref("SESSION_SECRET"), Joi.ref("JWT_ACCESS_TOKEN_SECRET"))
    .messages({
      "any.invalid":
        "MCP_KEY_PEPPER must differ from every other application secret",
    }),
};
