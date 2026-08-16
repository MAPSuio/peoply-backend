import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

export function IsLaterDateStringThan(
  earliestDateVariableName: string,
  validationOptions?: ValidationOptions,
) {
  return createValidator(
    {
      name: "IsLaterDateStringThan",
      constraints: [earliestDateVariableName],
      validate: (value, args) => {
        if (value === "") return true;
        const earliestDate = (args.object as any)[earliestDateVariableName];
        if (!earliestDate) {
          return true;
        }
        return new Date(earliestDate) <= new Date(value as string);
      },
      defaultMessage: () =>
        "This the date must be later than the date defined in the column '" +
        earliestDateVariableName +
        "'",
    },
    validationOptions,
  );
}
