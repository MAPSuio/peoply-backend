import { createTransformer } from "./create.transformer";

const stringToNumberOrNull = (value: string | null | undefined) => {
  /* `new Number(null).valueOf()` is 0, so an explicit null used to come out
     the other side as a real zero - a null capacity became an event nobody
     can register for, and a null latitude became a point off the coast of
     Ghana. The name says OrNull; make it true for null as well as "". */
  if (value === "" || value === null || value === undefined) return null;
  return new Number(value).valueOf();
};

const StringToNumberOrNull = () => createTransformer(stringToNumberOrNull);

export { StringToNumberOrNull };
