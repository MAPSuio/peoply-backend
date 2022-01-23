import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

export function MinDateString(
  min_time: Date,
  validationOptions?: ValidationOptions,
) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "MinDateString",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          return min_time < new Date(args.value);
        },
        defaultMessage() {
          return "The date is too early. The date has to be after " + min_time;
        },
      },
    });
  };
}
