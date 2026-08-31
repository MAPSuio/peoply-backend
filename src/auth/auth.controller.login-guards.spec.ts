import { CanActivate, ExecutionContext } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AuthController } from "./auth.controller";

const PLAIN_LOGIN_ROUTES = ["/login", "/login/google"];
const CONFIRM_LINK_ROUTES = ["/confirm-link", "/confirm-link/google"];

const handlerForRoute = (path: string) =>
  Object.getOwnPropertyNames(AuthController.prototype)
    .map((name) => (AuthController.prototype as never)[name])
    .find(
      (handler) =>
        typeof handler === "function" &&
        Reflect.getMetadata(PATH_METADATA, handler) === path,
    );

const sessionGuardBoundTo = (path: string): CanActivate => {
  const handler = handlerForRoute(path);

  expect(handler).toBeDefined();

  const [SessionGuard] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

  expect(SessionGuard).toBeDefined();

  return new SessionGuard();
};

const plantedSessionHolding = (pendingLink: unknown) => {
  const session: Record<string, unknown> & {
    regenerate: (done: (error?: Error) => void) => void;
    regenerated: number;
  } = {
    pendingLink,
    linkUserId: "attacker-1",
    regenerated: 0,
    regenerate(done) {
      for (const key of Object.keys(session)) {
        if (key === "regenerate" || key === "regenerated") continue;
        delete session[key];
      }
      session.regenerated += 1;
      done();
    },
  };

  return session;
};

const contextFor = (session: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ session }) }),
  }) as ExecutionContext;

describe("what the guard on each login entry point does to a parked link", () => {
  const parkedLink = { sub: "sub-g", matchedUserId: "victim-1" };

  it.each(PLAIN_LOGIN_ROUTES)(
    "%s starts over, so a planted link cannot ride into it",
    async (path) => {
      const session = plantedSessionHolding({ ...parkedLink });

      await sessionGuardBoundTo(path).canActivate(contextFor(session));

      expect(session.regenerated).toBe(1);
      expect(session.pendingLink).toBeUndefined();
      expect(session.linkUserId).toBeUndefined();
    },
  );

  it.each(CONFIRM_LINK_ROUTES)(
    "%s starts over but carries the parked link across",
    async (path) => {
      const session = plantedSessionHolding({ ...parkedLink });

      await sessionGuardBoundTo(path).canActivate(contextFor(session));

      expect(session.regenerated).toBe(1);
      expect(session.pendingLink).toEqual(parkedLink);
      expect(session.linkUserId).toBeUndefined();
    },
  );
});
