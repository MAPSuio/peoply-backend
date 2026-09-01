import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  BUDGET_CLOCK,
  BUDGET_STORE,
  type BudgetStore,
  type Clock,
} from "../abuse-budget/budget-tokens";

export const MENTION_COOLDOWN_MS = 60 * 60 * 1000;

const MENTION_KEY = "alert:mention";

/**
 * How often an alert is allowed to ping everyone in the channel.
 *
 * Reporting an organisation is once per hour per organisation, which bounds
 * nothing worth bounding: one account can report every organisation on the
 * platform and ping the channel once per organisation per hour. The alert
 * still goes out either way; only the mention is rationed.
 */
@Injectable()
export class MentionCooldown {
  private readonly logger = new Logger(MentionCooldown.name);

  constructor(
    @Inject(BUDGET_STORE) private readonly store: BudgetStore,
    @Inject(BUDGET_CLOCK) private readonly clock: Clock,
  ) {}

  async mayMention(): Promise<boolean> {
    try {
      const state = await this.store.increment(
        MENTION_KEY,
        1,
        MENTION_COOLDOWN_MS,
        this.clock.now(),
      );

      return state.count === 1;
    } catch (error) {
      this.logger.warn(
        `Cannot tell whether the channel was pinged recently, so leaving the mention off: ${
          error instanceof Error ? error.message : error
        }`,
      );

      return false;
    }
  }
}
