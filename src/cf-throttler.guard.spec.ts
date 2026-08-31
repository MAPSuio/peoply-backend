import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Throttle } from "@nestjs/throttler";
import { CfThrottlerGuard } from "./cf-throttler.guard";

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
  const generateKey = (context: ExecutionContext, suffix: string) =>
    (
      guard as never as {
        generateKey: (c: ExecutionContext, s: string, n: string) => string;
      }
    ).generateKey(context, suffix, "default");

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
    it("spends one shared allowance across routes that set no limit of their own", () => {
      expect(
        generateKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).toBe(
        generateKey(
          contextFor(UnthrottledController, "listOrganizations"),
          VISITOR,
        ),
      );
    });

    it("keeps a route with its own limit out of the shared allowance", () => {
      expect(
        generateKey(contextFor(ThrottledController, "logIn"), VISITOR),
      ).not.toBe(
        generateKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      );
    });

    it("gives two routes with their own limits separate allowances", () => {
      expect(
        generateKey(contextFor(ThrottledController, "logIn"), VISITOR),
      ).not.toBe(
        generateKey(contextFor(ThrottledController, "resetPassword"), VISITOR),
      );
    });

    it("keeps two visitors apart", () => {
      expect(
        generateKey(contextFor(UnthrottledController, "listEvents"), VISITOR),
      ).not.toBe(
        generateKey(contextFor(UnthrottledController, "listEvents"), "1.1.1.1"),
      );
    });
  });
});
