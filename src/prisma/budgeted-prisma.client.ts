import { PrismaClient } from "../generated/prisma/client";
import type { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import {
  creationChargesFor,
  refuseCostedUpsert,
} from "../abuse-budget/budgeted-prisma.extension";
import { currentIdentities } from "../abuse-budget/principal-context";

export function withAbuseBudget(
  client: PrismaClient,
  budget: AbuseBudgetService,
) {
  return client.$extends({
    name: "abuse-budget",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const identities = currentIdentities();

          if (identities) {
            refuseCostedUpsert(model, operation);

            for (const [action, rows] of creationChargesFor(
              model,
              operation,
              args,
            )) {
              await budget.consume(identities, action, rows);
            }
          }

          return query(args);
        },
      },
    },
  });
}
