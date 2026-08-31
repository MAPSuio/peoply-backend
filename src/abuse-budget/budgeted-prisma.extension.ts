import type { BudgetAction } from "./budget-action";
import { RELATION_TARGET_MODELS } from "./relation-target-models";

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
]);

const WRITE_ARGUMENT_KEYS = ["data", "create", "update"] as const;

const NESTED_UPDATE_KEYS = ["update", "updateMany"] as const;

type CostedModel = keyof typeof COSTED_CREATE_ACTIONS;

export type CreationCharges = Map<BudgetAction, number>;

function costedActionOfModel(model: string): BudgetAction | null {
  const key = model.charAt(0).toLowerCase() + model.slice(1);

  return COSTED_CREATE_ACTIONS[key as CostedModel] ?? null;
}

export function costedCreateAction(
  model: string | undefined,
  operation: string,
): BudgetAction | null {
  if (!model || !CREATE_OPERATIONS.has(operation)) return null;

  return costedActionOfModel(model);
}

export function refuseCostedUpsert(
  model: string | undefined,
  operation: string,
): void {
  if (operation !== "upsert" || !model) return;
  if (costedActionOfModel(model) === null) return;

  throw new Error(
    `${model} carries a creation budget and must not be upserted from request-scoped code, because an upsert that updates would still pay for a create. Decide between create and update at the call site.`,
  );
}

export function rowsCreatedBy(args: unknown): number {
  const data = (args as { data?: unknown } | undefined)?.data;

  return Array.isArray(data) ? data.length : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsIn(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);

  return isRecord(value) ? [value] : [];
}

function addCharge(charges: CreationCharges, model: string, rows: number) {
  const action = costedActionOfModel(model);

  if (!action || rows === 0) return;

  charges.set(action, (charges.get(action) ?? 0) + rows);
}

function changedRecordsIn(relationWrite: Record<string, unknown>) {
  return NESTED_UPDATE_KEYS.flatMap((key) =>
    recordsIn(relationWrite[key]).flatMap((entry) =>
      recordsIn(entry.data ?? entry),
    ),
  );
}

function chargeRelationWrite(
  targetModel: string,
  relationWrite: Record<string, unknown>,
  charges: CreationCharges,
) {
  const createdRows = recordsIn(relationWrite.create);
  const batchedRows = isRecord(relationWrite.createMany)
    ? recordsIn(relationWrite.createMany.data)
    : [];
  const createdIfMissing = recordsIn(relationWrite.connectOrCreate);

  addCharge(
    charges,
    targetModel,
    createdRows.length + batchedRows.length + createdIfMissing.length,
  );

  chargeNestedWrites(targetModel, createdRows, charges);
  chargeNestedWrites(targetModel, batchedRows, charges);
  chargeNestedWrites(
    targetModel,
    createdIfMissing.map((entry) => entry.create),
    charges,
  );
  chargeNestedWrites(targetModel, changedRecordsIn(relationWrite), charges);
}

function chargeNestedWrites(
  parentModel: string,
  writePayload: unknown,
  charges: CreationCharges,
) {
  for (const record of recordsIn(writePayload)) {
    for (const [fieldName, relationWrite] of Object.entries(record)) {
      const targetModel = RELATION_TARGET_MODELS[`${parentModel}.${fieldName}`];

      if (!targetModel || !isRecord(relationWrite)) continue;

      chargeRelationWrite(targetModel, relationWrite, charges);
    }
  }
}

export function creationChargesFor(
  model: string | undefined,
  operation: string,
  args: unknown,
): CreationCharges {
  const charges: CreationCharges = new Map();
  const topLevelAction = costedCreateAction(model, operation);

  if (topLevelAction) charges.set(topLevelAction, rowsCreatedBy(args));

  if (model && isRecord(args)) {
    for (const key of WRITE_ARGUMENT_KEYS) {
      chargeNestedWrites(model, args[key], charges);
    }
  }

  return charges;
}
