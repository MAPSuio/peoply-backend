import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AuthController } from "./auth.controller";
import { ConfirmLinkGuard, FreshLoginSessionGuard } from "./guards";

const handlerForRoute = (path: string) =>
  Object.getOwnPropertyNames(AuthController.prototype)
    .map((name) => (AuthController.prototype as never)[name])
    .find(
      (handler) =>
        typeof handler === "function" &&
        Reflect.getMetadata(PATH_METADATA, handler) === path,
    );

const guardsBoundTo = (path: string) => {
  const handler = handlerForRoute(path);

  expect(handler).toBeDefined();

  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
};

const PLAIN_LOGIN_ROUTES = ["/login", "/login/google"];
const CONFIRM_LINK_ROUTES = ["/confirm-link", "/confirm-link/google"];

describe("a swapped guard would hand a parked link to an ordinary login", () => {
  it.each(PLAIN_LOGIN_ROUTES)(
    "%s starts from a session id nobody could have planted",
    (path) => {
      expect(guardsBoundTo(path)).toContain(FreshLoginSessionGuard);
      expect(guardsBoundTo(path)).not.toContain(ConfirmLinkGuard);
    },
  );

  it.each(CONFIRM_LINK_ROUTES)(
    "%s is the only door that carries the parked link across",
    (path) => {
      expect(guardsBoundTo(path)).toContain(ConfirmLinkGuard);
      expect(guardsBoundTo(path)).not.toContain(FreshLoginSessionGuard);
    },
  );
});
