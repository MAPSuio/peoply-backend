import { SkipThrottle } from "@nestjs/throttler";

export const PER_ROUTE_THROTTLER = "default";
export const WHOLE_APP_THROTTLER = "global";

export const RATE_LIMIT_POLICIES = [
  { name: PER_ROUTE_THROTTLER, ttl: 60000, limit: 100 },
  { name: WHOLE_APP_THROTTLER, ttl: 60000, limit: 600 },
];

const everyAllowance = Object.fromEntries(
  RATE_LIMIT_POLICIES.map((policy) => [policy.name, true]),
);

export const SkipRateLimit = () => SkipThrottle(everyAllowance);
