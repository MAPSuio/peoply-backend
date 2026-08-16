import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

/**
 * Caps how many whitespace-separated tokens a search string may contain.
 *
 * A length limit bounds this only indirectly, and badly: the cost of a search
 * is driven by the token count, because each token becomes its own set of SQL
 * predicates. Stating the limit that actually matters keeps the two from
 * drifting apart if the length is ever raised.
 */
export function MaxSearchTokens(
  max: number,
  validationOptions?: ValidationOptions,
) {
  return createValidator(
    {
      name: "MaxSearchTokens",
      constraints: [max],
      validate: (value) => {
        if (typeof value !== "string") {
          // Leave the type complaint to @IsString.
          return true;
        }
        return value.trim().split(/\s+/).filter(Boolean).length <= max;
      },
      defaultMessage: (args) =>
        `${args.property} must not contain more than ${args.constraints[0]} words`,
    },
    validationOptions,
  );
}
