import { Injectable } from "@nestjs/common";
import type { BudgetStore, BudgetWindowState } from "./budget-store";

interface Window {
  count: number;
  resetAtMs: number;
}

@Injectable()
export class InMemoryBudgetStore implements BudgetStore {
  private readonly windows = new Map<string, Window>();

  async increment(
    key: string,
    cost: number,
    windowMs: number,
    nowMs: number,
  ): Promise<BudgetWindowState> {
    const current = this.windows.get(key);

    if (!current || current.resetAtMs <= nowMs) {
      const fresh = { count: cost, resetAtMs: nowMs + windowMs };
      this.windows.set(key, fresh);
      return fresh;
    }

    current.count += cost;
    return current;
  }
}
