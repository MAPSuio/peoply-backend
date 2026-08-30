import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { McpApiKeyScope } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateMcpApiKeyDto } from "./dto/create-mcp-api-key.dto";
import {
  MCP_KEY_PEPPER_MIN_LENGTH,
  MCP_KEY_PREFIX,
  MCP_MAX_ACTIVE_KEYS_PER_USER,
  MCP_SCOPE_NAMES,
} from "./mcp.constants";

const TOKEN_PATTERN = new RegExp(
  `^${MCP_KEY_PREFIX}_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})_([A-Za-z0-9_-]{43})$`,
);
const LAST_USED_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_LISTED_KEYS = 100;
const TRANSACTION_RETRIES = 3;

const PUBLIC_KEY_SELECT = {
  id: true,
  name: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

export type VerifiedMcpApiKey = {
  keyId: string;
  user: {
    id: string;
    arrangerId: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  scopes: string[];
  expiresAt: Date;
};

@Injectable()
export class McpApiKeyService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const pepper = configService.get<string>("MCP_KEY_PEPPER");

    if (!pepper || pepper.length < MCP_KEY_PEPPER_MIN_LENGTH) {
      throw new Error(
        `MCP_KEY_PEPPER must be at least ${MCP_KEY_PEPPER_MIN_LENGTH} characters`,
      );
    }

    this.pepper = pepper;
  }

  async create(userId: string, dto: CreateMcpApiKeyDto) {
    const now = new Date();
    const id = randomUUID();
    const secret = randomBytes(32).toString("base64url");
    const token = `${MCP_KEY_PREFIX}_${id}_${secret}`;
    const expiresAt = new Date(
      now.getTime() + dto.expiresInDays * 24 * 60 * 60 * 1000,
    );
    const data = {
      id,
      userId,
      name: dto.name.trim(),
      secretHash: this.hash(token),
      scopes: [...new Set(dto.scopes)],
      expiresAt,
    };

    let key: Awaited<ReturnType<typeof this.createInTransaction>> | undefined;
    for (let attempt = 0; attempt < TRANSACTION_RETRIES; attempt++) {
      try {
        key = await this.createInTransaction(userId, now, data);
        break;
      } catch (error) {
        if (
          !this.isWriteConflict(error) ||
          attempt === TRANSACTION_RETRIES - 1
        ) {
          throw error;
        }
      }
    }

    if (!key) {
      throw new Error("MCP API key transaction did not complete");
    }

    return { ...key, token };
  }

  list(userId: string) {
    return this.prisma.mcpApiKey.findMany({
      where: { userId },
      select: PUBLIC_KEY_SELECT,
      orderBy: { createdAt: "desc" },
      take: MAX_LISTED_KEYS,
    });
  }

  async revoke(userId: string, keyId: string) {
    const key = await this.prisma.mcpApiKey.findFirst({
      where: { id: keyId, userId },
      select: { id: true, revokedAt: true },
    });

    if (!key) {
      throw new NotFoundException("MCP key not found");
    }

    if (!key.revokedAt) {
      await this.prisma.mcpApiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async verify(token: string): Promise<VerifiedMcpApiKey> {
    const match = TOKEN_PATTERN.exec(token);
    if (!match) {
      throw new UnauthorizedException("Invalid MCP API key");
    }

    const key = await this.prisma.mcpApiKey.findUnique({
      where: { id: match[1] },
      include: {
        user: {
          select: {
            id: true,
            arrangerId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const suppliedHash = Buffer.from(this.hash(token), "hex");
    const storedHash = Buffer.from(key?.secretHash ?? "0".repeat(64), "hex");
    const isValidHash = timingSafeEqual(suppliedHash, storedHash);
    const now = new Date();

    if (!key || !isValidHash || key.revokedAt || key.expiresAt <= now) {
      throw new UnauthorizedException("Invalid MCP API key");
    }

    if (
      !key.lastUsedAt ||
      now.getTime() - key.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS
    ) {
      await this.prisma.mcpApiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: now },
      });
    }

    return {
      keyId: key.id,
      user: key.user,
      scopes: this.expandScopes(key.scopes),
      expiresAt: key.expiresAt,
    };
  }

  private hash(token: string) {
    return createHmac("sha256", this.pepper).update(token).digest("hex");
  }

  private createInTransaction(
    userId: string,
    now: Date,
    data: Parameters<PrismaService["mcpApiKey"]["create"]>[0]["data"],
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const activeKeyCount = await tx.mcpApiKey.count({
          where: { userId, revokedAt: null, expiresAt: { gt: now } },
        });

        if (activeKeyCount >= MCP_MAX_ACTIVE_KEYS_PER_USER) {
          throw new ConflictException(
            `You can have at most ${MCP_MAX_ACTIVE_KEYS_PER_USER} active MCP keys`,
          );
        }

        return tx.mcpApiKey.create({ data, select: PUBLIC_KEY_SELECT });
      },
      { isolationLevel: "Serializable" },
    );
  }

  private isWriteConflict(error: unknown): error is { code: "P2034" } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034"
    );
  }

  private expandScopes(scopes: McpApiKeyScope[]) {
    const expanded = new Set(scopes.map((scope) => MCP_SCOPE_NAMES[scope]));

    if (scopes.includes(McpApiKeyScope.ORGANIZE)) {
      expanded.add(MCP_SCOPE_NAMES[McpApiKeyScope.WRITE]);
    }
    if (scopes.some((scope) => scope !== McpApiKeyScope.READ)) {
      expanded.add(MCP_SCOPE_NAMES[McpApiKeyScope.READ]);
    }

    return [...expanded];
  }
}
