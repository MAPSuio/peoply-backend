import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { McpApiKeyScope } from "../../generated/prisma/client";
import { CreateMcpApiKeyDto } from "./create-mcp-api-key.dto";

describe("CreateMcpApiKeyDto", () => {
  it("accepts a minimal valid payload", () => {
    const dto = plainToInstance(CreateMcpApiKeyDto, {
      name: "Claude Code",
    });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
  });

  it("accepts explicit scopes and expiresInDays", () => {
    const dto = plainToInstance(CreateMcpApiKeyDto, {
      name: "Claude Code",
      scopes: [McpApiKeyScope.READ, McpApiKeyScope.WRITE],
      expiresInDays: 60,
    });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
  });

  it("rejects an explicit null for scopes", () => {
    const dto = plainToInstance(CreateMcpApiKeyDto, {
      name: "Claude Code",
      scopes: null,
    });
    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === "scopes")).toBe(true);
  });

  it("rejects an empty array for scopes", () => {
    const dto = plainToInstance(CreateMcpApiKeyDto, {
      name: "Claude Code",
      scopes: [],
    });
    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === "scopes")).toBe(true);
  });

  it("rejects an explicit null for expiresInDays", () => {
    const dto = plainToInstance(CreateMcpApiKeyDto, {
      name: "Claude Code",
      expiresInDays: null,
    });
    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === "expiresInDays")).toBe(
      true,
    );
  });

  it("rejects an expiresInDays exceeding maximum", () => {
    const dto = plainToInstance(CreateMcpApiKeyDto, {
      name: "Claude Code",
      expiresInDays: 400,
    });
    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === "expiresInDays")).toBe(
      true,
    );
  });
});
