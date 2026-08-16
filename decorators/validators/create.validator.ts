import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

/**
 * The wrapper every validator in this directory needs, so that each one only
 * has to say what makes a value valid and how to phrase the complaint.
 */
export const createValidator = (
  {
    name,
    constraints = [],
    validate,
    defaultMessage,
  }: {
    name: string;
    constraints?: unknown[];
    validate: (value: unknown, args: ValidationArguments) => boolean;
    defaultMessage: (args: ValidationArguments) => string;
  },
  validationOptions?: ValidationOptions,
): PropertyDecorator => {
  return (target, propertyName) => {
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: propertyName as string,
      constraints,
      options: validationOptions,
      validator: { validate, defaultMessage },
    });
  };
};
