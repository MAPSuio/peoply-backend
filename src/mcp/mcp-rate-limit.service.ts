import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { MCP_REQUESTS_PER_MINUTE } from "./mcp.constants";

type RateLimitWindow = {
  count: number;
  resetsAt: number;
};

@Injectable()
export class McpRateLimitService implements OnModuleDestroy {
  // In-memory rate limiting for single-instance deployment; back with a shared store if scaled horizontally.
  private readonly windows = new Map<string, RateLimitWindow>();
  private readonly cleanupTimer = setInterval(
    () => this.removeExpired(),
    60_000,
  );

  constructor() {
    this.cleanupTimer.unref();
  }

  consume(keyId: string, now = Date.now()) {
    const current = this.windows.get(keyId);

    if (!current || current.resetsAt <= now) {
      this.windows.set(keyId, { count: 1, resetsAt: now + 60_000 });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= MCP_REQUESTS_PER_MINUTE) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.resetsAt - now) / 1000),
        ),
      };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  private removeExpired(now = Date.now()) {
    for (const [keyId, window] of this.windows) {
      if (window.resetsAt <= now) {
        this.windows.delete(keyId);
      }
    }
  }
}
