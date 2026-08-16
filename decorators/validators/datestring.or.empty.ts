import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

export function IsDateStringOrEmptyString(
  validationOptions?: ValidationOptions,
) {
  return createValidator(
    {
      name: "IsDateStringOrEmptyString",
      validate: (value) =>
        value === "" || !Number.isNaN(new Date(value as string).getTime()),
      defaultMessage: () =>
        "This the date must be a valid date string or an empty string",
    },
    validationOptions,
  );
}
