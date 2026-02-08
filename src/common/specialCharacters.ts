import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

function NoSpecialCharacters(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'noSpecialCharacters',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const specialCharactersRegex = /[!@#$%^&*(),.?":{}|<>]/;

          if (specialCharactersRegex.test(value)) {
            return false; // Validation failed
          }

          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} cannot contain special characters`;
        },
      },
    });
  };
}

export default NoSpecialCharacters;
