import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

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
  return (object: Object, propertyName: string) => {
    registerDecorator({
      name: "MaxSearchTokens",
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== "string") {
            // Leave the type complaint to @IsString.
            return true;
          }
          return value.trim().split(/\s+/).filter(Boolean).length <= max;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must not contain more than ${args.constraints[0]} words`;
        },
      },
    });
  };
}
