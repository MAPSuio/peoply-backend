// this code is from stack overflow: https://stackoverflow.com/questions/59046629/boolean-parameter-in-request-body-is-always-true-in-nestjs-api
import { Transform } from "class-transformer";

const EmptyStringToNull = () => {
  const toPlain = Transform(
    ({ value }) => {
      return value;
    },
    {
      toPlainOnly: true,
    },
  );
  const toClass = (target: any, key: string) => {
    return Transform(
      ({ obj }) => {
        return stringToNull(obj[key]);
      },
      {
        toClassOnly: true,
      },
    )(target, key);
  };
  return function (target: any, key: string) {
    toPlain(target, key);
    toClass(target, key);
  };
};

const stringToNull = (value: string) => {
  if (value === "") return null;
  return value;
};

export { EmptyStringToNull };
