export interface BudgetWindowState {
  count: number;
  resetAtMs: number;
}

export interface BudgetStore {
  increment(
    key: string,
    cost: number,
    windowMs: number,
    nowMs: number,
  ): Promise<BudgetWindowState>;
}

export interface Clock {
  now(): number;
}

export const SYSTEM_CLOCK: Clock = {
  now: () => Date.now(),
};
