import { createTransformer } from "./create.transformer";

/** Trims surrounding whitespace off a string; anything else passes through. */
export const Trim = () =>
  createTransformer((value: unknown) =>
    typeof value === "string" ? value.trim() : value,
  );
