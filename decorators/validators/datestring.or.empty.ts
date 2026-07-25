import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

export function IsDateStringOrEmptyString(
  validationOptions?: ValidationOptions,
) {
  return (object: Object, propertyName: string) => {
    registerDecorator({
      name: "IsDateStringOrEmptyString",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          if (args.value === "") return true;
          //check if it is a valid date string
          if (isNaN(new Date(args.value).getTime())) {
            return false;
          }
          return true;
        },
        defaultMessage() {
          return "This the date must be a valid date string or an empty string";
        },
      },
    });
  };
}
