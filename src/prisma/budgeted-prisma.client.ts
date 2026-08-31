import { PrismaClient } from "../generated/prisma/client";
import type { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { UnauthorizedException } from "@nestjs/common";
import {
  creationChargesFor,
  refuseCostedUpsert,
  usesFullTextSearch,
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

            if (usesFullTextSearch(args)) {
              if (!identities.user && !identities.mcpKey) {
                throw new UnauthorizedException(
                  "Full-text search requires an authenticated caller",
                );
              }

              await budget.consume(identities, "search.text");
            }

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
