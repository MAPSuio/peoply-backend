import { Transform } from "class-transformer";

/**
 * The wrapper every transformer in this directory needs, so that each one only
 * has to say how a single value is converted.
 *
 * The two directions are not symmetric. Serialising back out (`toPlainOnly`)
 * must hand the value over untouched — the conversion has already happened on
 * the way in, and running it a second time would, for instance, turn a real
 * `false` into `undefined`.
 *
 * Reading in (`toClassOnly`) deliberately takes the value off `obj` rather than
 * using the `value` class-transformer offers. `value` has already been through
 * `@Type()` and any other transform on the property, so a query string that is
 * meant to become an array of ints would arrive here as `NaN` rather than as
 * the string that was actually sent.
 */
export const createTransformer = <T>(
  convert: (value: any) => T,
): PropertyDecorator => {
  const toPlain = Transform(({ value }) => value, { toPlainOnly: true });

  /* Typed as PropertyDecorator rather than `(target, key: string)`: the
     narrower signature cannot be handed to `applyDecorators`, which is what
     composes these with the validators. */
  return (target, key) => {
    toPlain(target, key);
    Transform(({ obj }) => convert(obj[key as string]), { toClassOnly: true })(
      target,
      key,
    );
  };
};
