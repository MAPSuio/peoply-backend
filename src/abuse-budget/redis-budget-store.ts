import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import type { BudgetStore, BudgetWindowState } from "./budget-store";

const INCREMENT_WITHIN_WINDOW = `
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
if count == tonumber(ARGV[1]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

interface RedisWithIncrementWithinWindow extends Redis {
  incrementWithinWindow(
    key: string,
    cost: string,
    windowMs: string,
  ): Promise<[number, number]>;
}

@Injectable()
export class RedisBudgetStore implements BudgetStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisBudgetStore.name);
  private readonly redis: RedisWithIncrementWithinWindow;

  constructor(connectionUrl: string) {
    this.redis = new Redis(connectionUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
    }) as RedisWithIncrementWithinWindow;

    this.redis.on("error", (error: Error) => {
      this.logger.error(`Budget store connection error: ${error.message}`);
    });

    this.redis.defineCommand("incrementWithinWindow", {
      numberOfKeys: 1,
      lua: INCREMENT_WITHIN_WINDOW,
    });
  }

  async increment(
    key: string,
    cost: number,
    windowMs: number,
    nowMs: number,
  ): Promise<BudgetWindowState> {
    const [count, remainingMs] = await this.redis.incrementWithinWindow(
      key,
      String(cost),
      String(windowMs),
    );

    return { count, resetAtMs: nowMs + Math.max(remainingMs, 0) };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
