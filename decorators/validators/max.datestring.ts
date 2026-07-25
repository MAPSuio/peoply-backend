import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

export function MaxDateString(
  maxTime: Date,
  validationOptions?: ValidationOptions,
) {
  return (object: Object, propertyName: string) => {
    registerDecorator({
      name: "MinDateString",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          return maxTime > new Date(args.value);
        },
        defaultMessage() {
          return `The date is too late. The date has to be before ${maxTime}`;
        },
      },
    });
  };
}
