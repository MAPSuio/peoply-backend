import { SkipThrottle } from "@nestjs/throttler";

export const PER_ROUTE_THROTTLER = "default";
export const WHOLE_APP_THROTTLER = "global";

export const SkipRateLimit = () =>
  SkipThrottle({
    [PER_ROUTE_THROTTLER]: true,
    [WHOLE_APP_THROTTLER]: true,
  });
