import { createTransformer } from "./create.transformer";

// convert a string [true, on, yes, 1] to boolean value true, [false, off, no 0] to false. Anything else is undefined
const valueToBoolean = (value: any) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (["true", "on", "yes", "1"].includes(value.toLowerCase())) {
    return true;
  }
  if (["false", "off", "no", "0"].includes(value.toLowerCase())) {
    return false;
  }
  return undefined;
};

const ToBoolean = () => createTransformer(valueToBoolean);

export { ToBoolean };
