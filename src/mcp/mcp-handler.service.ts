import {
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthInfo, createMcpHandler } from "@modelcontextprotocol/server";
import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { Request, Response } from "express";
import { McpApiKeyService } from "./mcp-api-key.service";
import { McpRateLimitService } from "./mcp-rate-limit.service";
import { McpServerFactory } from "./mcp-server.factory";

type AuthenticatedRequest = Request & { auth?: AuthInfo };

const ALLOWED_HOSTS = ["api.peoply.app", "localhost", "127.0.0.1", "[::1]"];
const ALLOWED_ORIGINS = [
  "peoply.app",
  "www.peoply.app",
  "localhost",
  "127.0.0.1",
  "[::1]",
];

@Injectable()
export class McpHandlerService implements OnModuleDestroy {
  private readonly logger = new Logger(McpHandlerService.name);
  private readonly validateHost = hostHeaderValidation(ALLOWED_HOSTS);
  private readonly validateOrigin = originValidation(ALLOWED_ORIGINS);
  private readonly handler = createMcpHandler(
    ({ authInfo }) => this.servers.create(authInfo),
    {
      responseMode: "json",
      onerror: (error) => this.logger.error(error.stack),
    },
  );
  private readonly nodeHandler = toNodeHandler(this.handler, {
    onerror: (error) => this.logger.error(error.stack),
  });

  constructor(
    private readonly apiKeys: McpApiKeyService,
    private readonly rateLimits: McpRateLimitService,
    private readonly servers: McpServerFactory,
  ) {}

  async handle(req: AuthenticatedRequest, res: Response) {
    if (!this.validateHost(req, res) || !this.validateOrigin(req, res)) {
      return;
    }

    try {
      const token = this.bearerToken(req.headers.authorization);
      const verified = await this.apiKeys.verify(token);
      const rateLimit = this.rateLimits.consume(verified.keyId);

      if (!rateLimit.allowed) {
        res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        res.status(429).json({ error: "MCP API key rate limit exceeded" });
        return;
      }

      req.auth = {
        token,
        clientId: verified.keyId,
        scopes: verified.scopes,
        expiresAt: Math.floor(verified.expiresAt.getTime() / 1000),
        extra: { user: verified.user, keyId: verified.keyId },
      };
      await this.nodeHandler(req, res, req.body);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.setHeader("WWW-Authenticate", "Bearer");
        res.status(401).json({ error: "Invalid or missing MCP API key" });
        return;
      }

      throw error;
    }
  }

  async onModuleDestroy() {
    await this.handler.close();
  }

  private bearerToken(header?: string) {
    const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
    if (!match) {
      throw new UnauthorizedException("Missing MCP API key");
    }
    return match[1];
  }
}
