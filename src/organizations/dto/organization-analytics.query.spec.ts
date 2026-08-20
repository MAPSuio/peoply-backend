import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  ANALYTICS_PERIODS,
  OrganizationAnalyticsQueryDto,
} from "./organization-analytics.query";

describe("OrganizationAnalyticsQueryDto", () => {
  it.each([...ANALYTICS_PERIODS])("accepts period %s", async (period) => {
    const dto = plainToInstance(OrganizationAnalyticsQueryDto, { period });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("accepts a missing period", async () => {
    const dto = plainToInstance(OrganizationAnalyticsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects unknown periods", async () => {
    const dto = plainToInstance(OrganizationAnalyticsQueryDto, {
      period: "2y",
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
