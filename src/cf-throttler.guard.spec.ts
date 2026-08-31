import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Throttle } from "@nestjs/throttler";
import { CfThrottlerGuard } from "./cf-throttler.guard";
import { PER_ROUTE_THROTTLER, WHOLE_APP_THROTTLER } from "./rate-limit";

const CLOUDFLARE_EDGE = "162.158.0.1";
const PLATFORM_HOP = "10.244.0.7";
const VISITOR = "84.211.24.137";

class UnthrottledController {
  listEvents() {}
  listOrganizations() {}
}

class ThrottledController {
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  logIn() {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resetPassword() {}

  @Throttle({ default: { ttl: 30000 } })
  requestVerification() {}
}

function contextFor(controller: new () => unknown, handler: string) {
  return {
    getClass: () => controller,
    getHandler: () => (controller.prototype as never)[handler],
  } as unknown as ExecutionContext;
}

describe("CfThrottlerGuard", () => {
  const getTracker = (req: unknown) =>
    (
      guard as never as {
        getTracker: (req: unknown) => Promise<string>;
      }
    ).getTracker(req);
  const generateKey = (
    context: ExecutionContext,
    suffix: string,
    name: string,
  ) =>
    (
      guard as never as {
        generateKey: (c: ExecutionContext, s: string, n: string) => string;
      }
    ).generateKey(context, suffix, name);
  const sharedKey = (context: ExecutionContext, suffix: string) =>
    generateKey(context, suffix, WHOLE_APP_THROTTLER);
  const routeKey = (context: ExecutionContext, suffix: string) =>
    generateKey(context, suffix, PER_ROUTE_THROTTLER);

  let guard: CfThrottlerGuard;
  const originalSecret = process.env.CLOUDFLARE_ORIGIN_SECRET;

  beforeEach(() => {
    guard = new CfThrottlerGuard(null as never, null as never, new Reflector());
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    } else {
      process.env.CLOUDFLARE_ORIGIN_SECRET = originalSecret;
    }
  });

  describe("tracking", () => {
    it("tracks the visitor behind the edge, not the edge", async () => {
      await expect(
        getTracker({
          headers: { "x-forwarded-for": `${VISITOR}, ${CLOUDFLARE_EDGE}` },
          socket: { remoteAddress: PLATFORM_HOP },
        }),
      ).resolves.toBe(VISITOR);
    });

    it("returns 'unknown' when there is nothing to track", async () => {
      await expect(getTracker({ headers: {} })).resolves.toBe("unknown");
    });
  });

  describe("bucketing", () => {
    it("charges every route to one allowance for the caller", () => {
      expect(
        sharedKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).toBe(
        sharedKey(
          contextFor(UnthrottledController, "listOrganizations"),
          VISITOR,
        ),
      );
    });

    it("keeps a single route on its own allowance as well", () => {
      expect(
        routeKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).not.toBe(
        routeKey(
          contextFor(UnthrottledController, "listOrganizations"),
          VISITOR,
        ),
      );
    });

    it("never spends the same allowance on both counts", () => {
      expect(
        sharedKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).not.toBe(
        routeKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      );
    });

    it("leaves a route with its own limit counted per route", () => {
      expect(
        routeKey(contextFor(ThrottledController, "logIn"), VISITOR),
      ).not.toBe(
        routeKey(contextFor(ThrottledController, "resetPassword"), VISITOR),
      );
    });

    it("keeps two visitors apart on both counts", () => {
      expect(
        sharedKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).not.toBe(
        sharedKey(contextFor(UnthrottledController, "listEvents"), "1.1.1.1"),
      );
      expect(
        routeKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).not.toBe(
        routeKey(contextFor(UnthrottledController, "listEvents"), "1.1.1.1"),
      );
    });
  });
});
