import { PrismaClient } from "../generated/prisma/client";
import type { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import {
  costedCreateAction,
  rowsCreatedBy,
} from "../abuse-budget/budgeted-prisma.extension";
import { currentPrincipal } from "../abuse-budget/principal-context";

export function withAbuseBudget(
  client: PrismaClient,
  budget: AbuseBudgetService,
) {
  return client.$extends({
    name: "abuse-budget",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const action = costedCreateAction(model, operation);
          const principal = action ? currentPrincipal() : null;

          if (action && principal) {
            await budget.consume(principal, action, rowsCreatedBy(args));
          }

          return query(args);
        },
      },
    },
  });
}
