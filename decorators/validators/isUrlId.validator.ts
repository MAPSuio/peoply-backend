import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

export function IsUrlId(validationOptions?: ValidationOptions) {
  return createValidator(
    {
      name: "IsUrlId",
      /* Test if id is minimum 8 capital letters A-Z */
      validate: (value) => /^[A-Z]{8,}$/.test(value as string),
      defaultMessage: () =>
        "The id has to be a minimum of 8 capital letters A-Z",
    },
    validationOptions,
  );
}
