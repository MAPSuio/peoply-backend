import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

export function MaxDateString(
  maxTime: Date,
  validationOptions?: ValidationOptions,
) {
  return createValidator(
    {
      // Registered under the sibling's name since the first version; the name
      // is the key clients see in validation errors, so it stays put.
      name: "MinDateString",
      validate: (value) => maxTime > new Date(value as string),
      defaultMessage: () =>
        `The date is too late. The date has to be before ${maxTime}`,
    },
    validationOptions,
  );
}
