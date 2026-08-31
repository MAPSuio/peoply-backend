import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

const DEFAULT_ALLOWED_HOSTS = ["api.peoply.app"];
const DEFAULT_ALLOWED_ORIGINS = ["peoply.app", "www.peoply.app"];
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export type AuthenticatedRequest = Request & { auth?: AuthInfo };

@Injectable()
export class McpHandlerService implements OnModuleDestroy {
  private readonly logger = new Logger(McpHandlerService.name);
  private readonly validateHost: (req: Request, res: Response) => boolean;
  private readonly validateOrigin: (req: Request, res: Response) => boolean;
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
    @Optional() private readonly configService?: ConfigService,
  ) {
    const isDevOrLocalAuth =
      this.configService?.get<boolean>("LOCAL_AUTH_ENABLED") ??
      process.env.NODE_ENV !== "production";
    const allowedHosts = [
      ...DEFAULT_ALLOWED_HOSTS,
      ...(isDevOrLocalAuth ? LOOPBACK_HOSTS : []),
    ];
    const corsOrigins = (this.configService?.get<string>("CORS_ORIGIN") ?? "")
      .split(",")
      .map((origin) => {
        try {
          return new URL(origin.trim()).hostname;
        } catch {
          return origin.trim();
        }
      })
      .filter(Boolean);

    const allowedOrigins = Array.from(
      new Set([
        ...DEFAULT_ALLOWED_ORIGINS,
        ...corsOrigins,
        ...(isDevOrLocalAuth ? LOOPBACK_HOSTS : []),
      ]),
    );

    this.validateHost = hostHeaderValidation(allowedHosts);
    this.validateOrigin = originValidation(allowedOrigins);
  }

  async handle(req: AuthenticatedRequest, res: Response) {
    if (!this.validateHost(req, res) || !this.validateOrigin(req, res)) {
      return;
    }

    if (Array.isArray(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "JSON-RPC batch requests are not supported",
        },
      });
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
