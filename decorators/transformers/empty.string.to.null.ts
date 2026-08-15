import { createTransformer } from "./create.transformer";

const stringToNull = (value: string) => {
  if (value === "") return null;
  return value;
};

const EmptyStringToNull = () => createTransformer(stringToNull);

export { EmptyStringToNull };
