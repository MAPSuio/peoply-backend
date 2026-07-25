import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

export function IsLaterDateStringThan(
  earliestDateVariableName: string,
  validationOptions?: ValidationOptions,
) {
  return (object: Object, propertyName: string) => {
    registerDecorator({
      name: "IsLaterDateStringThan",
      target: object.constructor,
      propertyName: propertyName,
      constraints: [earliestDateVariableName],
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          if (args.value === "") return true;
          const earliestDate = (args.object as any)[earliestDateVariableName];
          if (!earliestDate) {
            return true;
          }
          const latestDate = args.value;
          return new Date(earliestDate) <= new Date(latestDate);
        },
        defaultMessage() {
          return (
            "This the date must be later than the date defined in the column '" +
            earliestDateVariableName +
            "'"
          );
        },
      },
    });
  };
}
