import { Global, Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AbuseBudgetService } from "./abuse-budget.service";
import { SYSTEM_CLOCK, type BudgetStore } from "./budget-store";
import { BUDGET_CLOCK, BUDGET_STORE } from "./budget-tokens";
import { InMemoryBudgetStore } from "./in-memory-budget-store";
import { RedisBudgetStore } from "./redis-budget-store";

export function createBudgetStore(
  connectionUrl: string | undefined,
  isProduction: boolean,
): BudgetStore {
  if (connectionUrl) return new RedisBudgetStore(connectionUrl);

  if (isProduction) {
    throw new Error(
      "REDIS_URL is not set. Rate limits would be per-instance and reset on every deploy.",
    );
  }

  new Logger("AbuseBudget").warn(
    "REDIS_URL is not set — using an in-memory budget store for local development.",
  );

  return new InMemoryBudgetStore();
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AbuseBudgetService,
    { provide: BUDGET_CLOCK, useValue: SYSTEM_CLOCK },
    {
      provide: BUDGET_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createBudgetStore(
          config.get<string>("REDIS_URL"),
          config.get<string>("NODE_ENV") === "production",
        ),
    },
  ],
  exports: [AbuseBudgetService, BUDGET_STORE, BUDGET_CLOCK],
})
export class AbuseBudgetModule {}
