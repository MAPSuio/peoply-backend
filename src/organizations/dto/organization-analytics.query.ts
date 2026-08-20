import { IsIn, IsOptional } from "class-validator";

export const ANALYTICS_PERIODS = ["24h", "7d", "30d", "90d", "1y"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = "1y";

export const ANALYTICS_PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

export class OrganizationAnalyticsQueryDto {
  @IsOptional()
  @IsIn(ANALYTICS_PERIODS)
  period?: AnalyticsPeriod;
}
