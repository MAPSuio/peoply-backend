import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

export function IsEarlierDateStringThan(
  latest_date_variable_name: string,
  validationOptions?: ValidationOptions,
) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "IsEarlierDateStringThan",
      target: object.constructor,
      propertyName: propertyName,
      constraints: [latest_date_variable_name],
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const latest_date = (args.object as any)[latest_date_variable_name];
          const earliest_date = args.value;
          return new Date(latest_date) >= new Date(earliest_date);
        },
        defaultMessage() {
          return (
            "This the date must be earlier than the date defined in the column '" +
            latest_date_variable_name +
            "'"
          );
        },
      },
    });
  };
}
