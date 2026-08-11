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

const stringToNumberOrNull = (value: string | null | undefined) => {
  /* `new Number(null).valueOf()` is 0, so an explicit null used to come out
     the other side as a real zero - a null capacity became an event nobody
     can register for, and a null latitude became a point off the coast of
     Ghana. The name says OrNull; make it true for null as well as "". */
  if (value === "" || value === null || value === undefined) return null;
  return new Number(value).valueOf();
};

export { StringToNumberOrNull };
