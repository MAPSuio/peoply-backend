import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

export function IsLaterDateStringThan(
  earliest_date_variable_name: string,
  validationOptions?: ValidationOptions,
) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "IsLaterDateStringThan",
      target: object.constructor,
      propertyName: propertyName,
      constraints: [earliest_date_variable_name],
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const earliest_date = (args.object as any)[
            earliest_date_variable_name
          ];
          const latest_date = args.value;
          return new Date(earliest_date) <= new Date(latest_date);
        },
        defaultMessage() {
          return (
            "This the date must be later than the date defined in the column '" +
            earliest_date_variable_name +
            "'"
          );
        },
      },
    });
  };
}
