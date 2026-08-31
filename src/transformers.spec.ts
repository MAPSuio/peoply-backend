import { instanceToPlain, plainToInstance } from "class-transformer";
import { EmptyStringToNull } from "../decorators/transformers/empty.string.to.null";
import { ToArray } from "../decorators/transformers/string.to.array";
import { ToBoolean } from "../decorators/transformers/string.to.boolean";
import { StringToNumberOrNull } from "../decorators/transformers/string.to.number.or.null";

/* Lives at the root of src rather than beside the code it covers: jest's
   rootDir is src, and the decorators are one directory further out. */
class Dto {
  @ToBoolean()
  flag?: boolean;

  @ToArray()
  ids?: string[];

  @ToArray({ type: "int" })
  numbers?: number[];

  @EmptyStringToNull()
  note?: string | null;

  @StringToNumberOrNull()
  capacity?: number | null;
}

const read = (plain: Record<string, unknown>) => plainToInstance(Dto, plain);

describe("query and multipart transformers", () => {
  describe("ToBoolean", () => {
    it.each([
      ["true", true],
      ["on", true],
      ["yes", true],
      ["1", true],
      ["TRUE", true],
      ["false", false],
      ["off", false],
      ["no", false],
      ["0", false],
      [true, true],
      [false, false],
    ])("reads %p as %p", (input, expected) => {
      expect(read({ flag: input }).flag).toBe(expected);
    });

    it.each([["maybe"], [null], [undefined]])(
      "leaves %p undefined",
      (input) => {
        expect(read({ flag: input }).flag).toBeUndefined();
      },
    );
  });

  describe("ToArray", () => {
    it("splits a comma-separated string", () => {
      expect(read({ ids: "a,b,c" }).ids).toEqual(["a", "b", "c"]);
    });

    it("parses a JSON-encoded array", () => {
      expect(read({ ids: '["a","b"]' }).ids).toEqual(["a", "b"]);
    });

    it("passes a real array through", () => {
      expect(read({ ids: ["a"] }).ids).toEqual(["a"]);
    });

    it.each([[null], [undefined], [42]])("leaves %p undefined", (input) => {
      expect(read({ ids: input }).ids).toBeUndefined();
    });

    it.each([["[}]"], ["[1,]"], ["[a]"]])(
      "reads bracketed-but-malformed JSON %p as undefined instead of throwing",
      (input) => {
        expect(() => read({ ids: input })).not.toThrow();
        expect(read({ ids: input }).ids).toBeUndefined();
      },
    );
  });

  describe('ToArray({ type: "int" })', () => {
    it("parses each element of a comma-separated string", () => {
      expect(read({ numbers: "1,2,3" }).numbers).toEqual([1, 2, 3]);
    });

    it("parses each element of a JSON-encoded array", () => {
      expect(read({ numbers: "[4,5]" }).numbers).toEqual([4, 5]);
    });

    it("parses each element of a real array", () => {
      expect(read({ numbers: ["6", "7"] }).numbers).toEqual([6, 7]);
    });

    it("leaves undefined undefined", () => {
      expect(read({ numbers: undefined }).numbers).toBeUndefined();
    });
  });

  describe("EmptyStringToNull", () => {
    it("turns the empty string into null", () => {
      expect(read({ note: "" }).note).toBeNull();
    });

    it("leaves other text alone", () => {
      expect(read({ note: "hei" }).note).toBe("hei");
    });
  });

  describe("StringToNumberOrNull", () => {
    it("parses a numeric string", () => {
      expect(read({ capacity: "30" }).capacity).toBe(30);
    });

    /* `new Number(null).valueOf()` is 0, which used to make a cleared capacity
       an event nobody can register for. */
    it.each([[""], [null], [undefined]])("reads %p as null", (input) => {
      expect(read({ capacity: input }).capacity).toBeNull();
    });
  });

  /* Serialising back out must not run the conversion a second time - that is
     what would turn a real `false` into `undefined` on the way to the client. */
  it("hands values back unchanged when writing out", () => {
    const dto = new Dto();
    dto.flag = false;
    dto.ids = ["a", "b"];
    dto.capacity = null;

    expect(instanceToPlain(dto)).toMatchObject({
      flag: false,
      ids: ["a", "b"],
      capacity: null,
    });
  });
});
