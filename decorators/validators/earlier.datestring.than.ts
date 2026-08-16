import { ValidationOptions } from "class-validator";
import { createValidator } from "./create.validator";

export function IsEarlierDateStringThan(
  latestDateVariableName: string,
  validationOptions?: ValidationOptions,
) {
  return createValidator(
    {
      name: "IsEarlierDateStringThan",
      constraints: [latestDateVariableName],
      validate: (value, args) => {
        const latestDate = (args.object as any)[latestDateVariableName];
        if (!latestDate) {
          return true;
        }
        return new Date(latestDate) >= new Date(value as string);
      },
      defaultMessage: () =>
        "This the date must be earlier than the date defined in the column '" +
        latestDateVariableName +
        "'",
    },
    validationOptions,
  );
}
