// this code is from stack overflow: https://stackoverflow.com/questions/59046629/boolean-parameter-in-request-body-is-always-true-in-nestjs-api
// convert a string [true, on, yes, 1] to boolean value true, [false, off, no 0] to false. Anything else is undefined
import { Transform } from "class-transformer";

interface ToArrayOptions {
  type: "int";
}

const ToArray = (toArrayOptions?: ToArrayOptions) => {
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
        if (toArrayOptions && toArrayOptions.type === "int") {
          return arrayToIntArray(obj[key]);
        }
        return valueToArray(obj[key]);
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

const valueToArray = (value: any) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    if (value[0] === "[" && value[value.length - 1] === "]") {
      return JSON.parse(value);
    }
    return value.split(",");
  }
  return undefined;
};

const arrayToIntArray = (value: any) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((v) => {
      return parseInt(v, 10);
    });
  }
  if (typeof value === "string") {
    if (value[0] === "[" && value[value.length - 1] === "]") {
      return JSON.parse(value).map((v: any) => {
        return parseInt(v, 10);
      });
    }
    return value.split(",").map((v) => {
      return parseInt(v, 10);
    });
  }
  return undefined;
};

export { ToArray };
