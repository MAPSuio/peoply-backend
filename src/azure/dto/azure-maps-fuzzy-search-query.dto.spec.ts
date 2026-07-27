import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { AzureMapsFuzzySearchQueryDto } from "./azure-maps-fuzzy-search-query.dto";

describe("AzureMapsFuzzySearchQueryDto", () => {
  const validate = (value: Record<string, unknown>) =>
    validateSync(plainToInstance(AzureMapsFuzzySearchQueryDto, value));

  it("rejects requests without a query", () => {
    const errors = validate({});

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("query");
    expect(errors[0].constraints).toHaveProperty("minLength");
  });

  it("rejects blank queries after trimming", () => {
    const errors = validate({ query: "   " });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("query");
    expect(errors[0].constraints).toHaveProperty("minLength");
  });

  it("preserves zero-valued numeric params during transformation", () => {
    const dto = plainToInstance(AzureMapsFuzzySearchQueryDto, {
      query: "Oslo",
      ofs: "0",
      radius: "0",
      typeahead: "false",
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.ofs).toBe(0);
    expect(dto.radius).toBe(0);
    expect(dto.typeahead).toBe(false);
  });

  it("splits comma-separated set params into arrays", () => {
    const dto = plainToInstance(AzureMapsFuzzySearchQueryDto, {
      query: "Karl Johans gate",
      countrySet: "NO,SE",
      idxSet: "Addr,POI",
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.countrySet).toEqual(["NO", "SE"]);
    expect(dto.idxSet).toEqual(["Addr", "POI"]);
  });

  it("rejects out-of-range numeric params", () => {
    const errors = validate({
      query: "Trondheim",
      limit: "0",
      maxFuzzyLevel: "5",
    });

    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["limit", "maxFuzzyLevel"]),
    );
  });
});
