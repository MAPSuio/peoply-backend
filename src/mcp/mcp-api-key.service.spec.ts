import { UnauthorizedException } from "@nestjs/common";
import { McpApiKeyScope } from "../generated/prisma/client";
import { CreateMcpApiKeyDto } from "./dto/create-mcp-api-key.dto";
import { McpApiKeyService } from "./mcp-api-key.service";

const USER_ID = "2d2bfaad-3eb9-4f1b-8657-c0263eeacc5b";

describe("McpApiKeyService", () => {
  const prisma = {
    $transaction: jest.fn(),
    mcpApiKey: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new McpApiKeyService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
  });

  it("retries a serializable transaction conflict", async () => {
    prisma.$transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce((callback: any) => callback(prisma));
    prisma.mcpApiKey.count.mockResolvedValue(0);
    prisma.mcpApiKey.create.mockImplementation(({ data }: any) => ({
      ...data,
      createdAt: new Date(),
      revokedAt: null,
      lastUsedAt: null,
    }));

    await service.create(USER_ID, {
      name: "OpenCode",
      scopes: [McpApiKeyScope.READ],
      expiresInDays: 30,
    } as CreateMcpApiKeyDto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("returns the secret once and stores only its hash", async () => {
    prisma.mcpApiKey.count.mockResolvedValue(0);
    prisma.mcpApiKey.create.mockImplementation(({ data }: any) => ({
      id: data.id,
      name: data.name,
      scopes: data.scopes,
      expiresAt: data.expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    }));

    const created = await service.create(USER_ID, {
      name: "Claude Code",
      scopes: [McpApiKeyScope.READ],
      expiresInDays: 30,
    } as CreateMcpApiKeyDto);
    const stored = prisma.mcpApiKey.create.mock.calls[0][0].data;

    expect(created.token).toMatch(/^ppl_mcp_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/);
    expect(stored.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.secretHash).not.toContain(created.token);
  });

  it("rejects a token whose secret does not match", async () => {
    prisma.mcpApiKey.findUnique.mockResolvedValue({
      id: "775e3f3c-f489-4bce-a9fb-a76173237d44",
      secretHash: "0".repeat(64),
      scopes: [McpApiKeyScope.READ],
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      lastUsedAt: null,
      user: {
        id: USER_ID,
        arrangerId: "0122cb1d-2572-4fbf-8b09-bf8738d68221",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
      },
    });

    await expect(
      service.verify(
        "ppl_mcp_775e3f3c-f489-4bce-a9fb-a76173237d44_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
