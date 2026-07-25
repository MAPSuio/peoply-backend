import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

export function IsUrlId(validationOptions?: ValidationOptions) {
  return (object: Object, propertyName: string) => {
    registerDecorator({
      name: "IsUrlId",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(_value: any, args: ValidationArguments) {
          const id = args.value;
          /* Test if id is minimum 8 capital letters A-Z */
          const regex = /^[A-Z]{8,}$/;
          return regex.test(id);
        },
        defaultMessage() {
          return "The id has to be a minimum of 8 capital letters A-Z";
        },
      },
    });
  };
}
