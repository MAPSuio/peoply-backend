import type { BudgetAction } from "./budget-action";

export const COSTED_CREATE_ACTIONS = {
  event: "event.create",
  organization: "organization.create",
  eventInvitation: "invitation.recipient",
  registration: "registration.create",
  arrangerFollowerEvent: "follow.create",
} as const satisfies Record<string, BudgetAction>;

const CREATE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "upsert",
]);

export type CostedModel = keyof typeof COSTED_CREATE_ACTIONS;

export function costedCreateAction(
  model: string | undefined,
  operation: string,
): BudgetAction | null {
  if (!model || !CREATE_OPERATIONS.has(operation)) return null;

  const key = model.charAt(0).toLowerCase() + model.slice(1);

  return COSTED_CREATE_ACTIONS[key as CostedModel] ?? null;
}

export function rowsCreatedBy(args: unknown): number {
  const data = (args as { data?: unknown } | undefined)?.data;

  return Array.isArray(data) ? data.length : 1;
}
