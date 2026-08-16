import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

export function MinDateString(
  minTime: Date,
  validationOptions?: ValidationOptions,
) {
  return createValidator(
    {
      name: "MinDateString",
      validate: (value) => minTime < new Date(value as string),
      defaultMessage: () =>
        `The date is too early. The date has to be after ${minTime}`,
    },
    validationOptions,
  );
}
