import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

export function IsEarlierDateStringThan(
  latestDateVariableName: string,
  validationOptions?: ValidationOptions,
) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "IsEarlierDateStringThan",
      target: object.constructor,
      propertyName: propertyName,
      constraints: [latestDateVariableName],
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const latestDate = (args.object as any)[latestDateVariableName];
          const earliestDate = args.value;
          return new Date(latestDate) >= new Date(earliestDate);
        },
        defaultMessage() {
          return (
            "This the date must be earlier than the date defined in the column '" +
            latestDateVariableName +
            "'"
          );
        },
      },
    });
  };
}
