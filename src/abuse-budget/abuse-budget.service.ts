import { Inject, Injectable, Logger } from "@nestjs/common";
import { BUDGET_ACTIONS, type BudgetAction } from "./budget-action";
import { BudgetExceeded, BudgetUnavailable } from "./budget-errors";
import {
  BUDGET_CLOCK,
  BUDGET_STORE,
  type Clock,
  type BudgetStore,
} from "./budget-tokens";
import { type Principal, principalKey } from "./principal";

@Injectable()
export class AbuseBudgetService {
  private readonly logger = new Logger(AbuseBudgetService.name);

  constructor(
    @Inject(BUDGET_STORE) private readonly store: BudgetStore,
    @Inject(BUDGET_CLOCK) private readonly clock: Clock,
  ) {}

  async consume(
    principal: Principal,
    action: BudgetAction,
    cost = 1,
  ): Promise<void> {
    const config = BUDGET_ACTIONS[action];
    const key = `abuse:${action}:${principalKey(principal)}`;
    const now = this.clock.now();

    let state: { count: number; resetAtMs: number };
    try {
      state = await this.store.increment(key, cost, config.windowMs, now);
    } catch (error) {
      if (config.failMode === "closed") {
        this.logger.error(
          `Budget store unavailable for ${action}, refusing (fail-closed)`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new BudgetUnavailable(action);
      }

      this.logger.warn(
        `Budget store unavailable for ${action}, allowing (fail-open)`,
      );
      return;
    }

    if (state.count > config.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.resetAtMs - now) / 1000),
      );
      throw new BudgetExceeded(action, retryAfterSeconds);
    }
  }
}
