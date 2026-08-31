import type { PrincipalKind } from "./principal";

type FailMode = "closed" | "open";

interface BudgetActionConfig {
  limit: number;
  windowMs: number;
  failMode: FailMode;
  keyBy: PrincipalKind;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const BUDGET_ACTIONS = {
  "event.create": {
    limit: 20,
    windowMs: DAY_MS,
    failMode: "closed",
    keyBy: "user",
  },
  "organization.create": {
    limit: 3,
    windowMs: DAY_MS,
    failMode: "closed",
    keyBy: "user",
  },
  "invitation.recipient": {
    limit: 500,
    windowMs: DAY_MS,
    failMode: "closed",
    keyBy: "user",
  },
  "registration.create": {
    limit: 200,
    windowMs: DAY_MS,
    failMode: "open",
    keyBy: "user",
  },
  "follow.create": {
    limit: 500,
    windowMs: DAY_MS,
    failMode: "open",
    keyBy: "user",
  },
  "mcp.tool": {
    limit: 120,
    windowMs: MINUTE_MS,
    failMode: "closed",
    keyBy: "mcpKey",
  },
} as const satisfies Record<string, BudgetActionConfig>;

export type BudgetAction = keyof typeof BUDGET_ACTIONS;
