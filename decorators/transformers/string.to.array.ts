import { createTransformer } from "./create.transformer";

export interface ToArrayOptions {
  type: "int";
}

/**
 * A repeated query parameter reaches us as a real array, a single one as a
 * plain string, and the frontend sends some of them JSON-encoded.
 */
const parseJsonArrayOrUndefined = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
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
      return parseJsonArrayOrUndefined(value);
    }
    return value.split(",");
  }
  return undefined;
};

const arrayToIntArray = (value: any) =>
  valueToArray(value)?.map((element: any) => parseInt(element, 10));

const ToArray = (toArrayOptions?: ToArrayOptions) =>
  createTransformer(
    toArrayOptions?.type === "int" ? arrayToIntArray : valueToArray,
  );

export { ToArray };
