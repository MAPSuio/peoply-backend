// this code is from stack overflow: https://stackoverflow.com/questions/59046629/boolean-parameter-in-request-body-is-always-true-in-nestjs-api
import { Transform } from "class-transformer";

const StringToNumberOrNull = () => {
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
        return stringToNumberOrNull(obj[key]);
      },
      {
        toClassOnly: true,
      },
    )(target, key);
  };
  return (target: any, key: string) => {
    toPlain(target, key);
    toClass(target, key);
  };
};

const stringToNumberOrNull = (value: string) => {
  if (value === "") return null;
  return new Number(value).valueOf();
};

export { StringToNumberOrNull };
