import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { McpApiKeyScope } from "../generated/prisma/client";
import { CreateMcpApiKeyDto } from "./dto/create-mcp-api-key.dto";
import { McpApiKeyService } from "./mcp-api-key.service";
import { MCP_MAX_ACTIVE_KEYS_PER_USER } from "./mcp.constants";

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

  it("throws ConflictException when user reaches active key limit", async () => {
    prisma.mcpApiKey.count.mockResolvedValue(MCP_MAX_ACTIVE_KEYS_PER_USER);

    await expect(
      service.create(USER_ID, {
        name: "Claude Code",
        scopes: [McpApiKeyScope.READ],
        expiresInDays: 30,
      } as CreateMcpApiKeyDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns the secret once and stores only its sha256 hash", async () => {
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

    expect(created.token).toMatch(
      /^ppl_mcp_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_[A-Za-z0-9_-]{43}$/,
    );
    expect(stored.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.secretHash).not.toBe(created.token);
    expect(stored.secretHash).toBe(
      createHash("sha256").update(created.token).digest("hex"),
    );
  });

  it("verifies an active key and expands scopes", async () => {
    const token =
      "ppl_mcp_775e3f3c-f489-4bce-a9fb-a76173237d44_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const secretHash = createHash("sha256").update(token).digest("hex");

    prisma.mcpApiKey.findUnique.mockResolvedValue({
      id: "775e3f3c-f489-4bce-a9fb-a76173237d44",
      secretHash,
      scopes: [McpApiKeyScope.ORGANIZE],
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
    prisma.mcpApiKey.update.mockResolvedValue({});

    const verified = await service.verify(token);

    expect(verified.keyId).toBe("775e3f3c-f489-4bce-a9fb-a76173237d44");
    expect(verified.scopes).toEqual(
      expect.arrayContaining([
        "peoply:organize",
        "peoply:write",
        "peoply:read",
      ]),
    );
  });

  it("rejects an unknown key ID", async () => {
    prisma.mcpApiKey.findUnique.mockResolvedValue(null);

    await expect(
      service.verify(
        "ppl_mcp_775e3f3c-f489-4bce-a9fb-a76173237d44_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a revoked key", async () => {
    const token =
      "ppl_mcp_775e3f3c-f489-4bce-a9fb-a76173237d44_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const secretHash = createHash("sha256").update(token).digest("hex");

    prisma.mcpApiKey.findUnique.mockResolvedValue({
      id: "775e3f3c-f489-4bce-a9fb-a76173237d44",
      secretHash,
      scopes: [McpApiKeyScope.READ],
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      lastUsedAt: null,
      user: { id: USER_ID },
    });

    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an expired key", async () => {
    const token =
      "ppl_mcp_775e3f3c-f489-4bce-a9fb-a76173237d44_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const secretHash = createHash("sha256").update(token).digest("hex");

    prisma.mcpApiKey.findUnique.mockResolvedValue({
      id: "775e3f3c-f489-4bce-a9fb-a76173237d44",
      secretHash,
      scopes: [McpApiKeyScope.READ],
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
      lastUsedAt: null,
      user: { id: USER_ID },
    });

    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a malformed token structure without querying DB", async () => {
    await expect(
      service.verify("ppl_mcp_invalid-uuid_shortsecret"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.mcpApiKey.findUnique).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when revoking key not owned by user", async () => {
    prisma.mcpApiKey.findFirst.mockResolvedValue(null);

    await expect(service.revoke(USER_ID, "key-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("revokes key owned by user", async () => {
    prisma.mcpApiKey.findFirst.mockResolvedValue({
      id: "key-1",
      revokedAt: null,
    });
    prisma.mcpApiKey.update.mockResolvedValue({});

    await service.revoke(USER_ID, "key-1");

    expect(prisma.mcpApiKey.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
