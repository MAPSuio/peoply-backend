import { ExecutionContext } from "@nestjs/common";
import { AccessSessionService } from "./access-session.service";
import { ModeratorGuard } from "./guards/moderator.guard";
import { OrganizationRolesGuard } from "./guards/organizationRoles.guard";
import { UserIdVerificationGuard } from "./guards/userIdVerification.guard";
import { EventRolesGuard } from "./guards/eventRoles.guard";
import { AuthenticatedInterceptor } from "./interceptors/authenticated.interceptor";
import { IsArrangerInterceptor } from "./interceptors/isArranger.interceptor";

const CURRENT_SESSION = "session-2";
const USER = {
  id: "user-1",
  email: "moderator@peoply.app",
  refreshTokenId: CURRENT_SESSION,
};

function sessionServiceMinting(sid: string | undefined) {
  const jwtService = { verify: () => ({ sub: USER.id, sid }) };
  const usersService = { findById: async () => USER };

  return new AccessSessionService(jwtService as never, usersService as never);
}

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

function freshRequest() {
  return {
    cookies: { access: "token" },
    params: { orgId: "org-1", userId: USER.id, id: "event-1" },
  };
}

const reflector = { get: () => ["ADMIN"] } as never;
const organizationsService = {
  findOne: async () => ({ id: "org-1" }),
  findOneByUrlId: async () => ({ id: "org-1" }),
  checkUserRole: async () => true,
} as never;
const eventAccess = { arrangerRoleFor: async () => "ORGANIZER" } as never;
const nextHandler = { handle: () => undefined } as never;

describe("every authenticated entry point after a logout", () => {
  const stale = () => sessionServiceMinting("session-1");
  const missing = () => sessionServiceMinting(undefined);
  const current = () => sessionServiceMinting(CURRENT_SESSION);

  process.env.MODERATOR_EMAILS = USER.email;

  const guards: [
    string,
    (session: AccessSessionService) => {
      canActivate: (context: ExecutionContext) => Promise<boolean>;
    },
  ][] = [
    ["ModeratorGuard", (session) => new ModeratorGuard(session)],
    [
      "OrganizationRolesGuard",
      (session) =>
        new OrganizationRolesGuard(reflector, organizationsService, session),
    ],
    [
      "UserIdVerificationGuard",
      (session) => new UserIdVerificationGuard(session),
    ],
    [
      "EventRolesGuard",
      (session) => new EventRolesGuard(reflector, session, eventAccess),
    ],
  ];

  it.each(guards)(
    "%s refuses a token from a rotated-away session",
    async (_name, build) => {
      await expect(
        build(stale()).canActivate(contextFor(freshRequest())),
      ).rejects.toThrow();
    },
  );

  it.each(guards)(
    "%s refuses a token that names no session at all",
    async (_name, build) => {
      await expect(
        build(missing()).canActivate(contextFor(freshRequest())),
      ).rejects.toThrow();
    },
  );

  it.each(guards)(
    "%s still admits a token from the current session",
    async (_name, build) => {
      await expect(
        build(current()).canActivate(contextFor(freshRequest())),
      ).resolves.toBe(true);
    },
  );

  const interceptors: [
    string,
    (session: AccessSessionService) => {
      intercept: (context: ExecutionContext, next: never) => Promise<unknown>;
    },
  ][] = [
    [
      "AuthenticatedInterceptor",
      (session) => new AuthenticatedInterceptor(session),
    ],
    [
      "IsArrangerInterceptor",
      (session) => new IsArrangerInterceptor(session, reflector, eventAccess),
    ],
  ];

  it.each(interceptors)(
    "%s leaves no user on the request after a rotated-away session",
    async (_name, build) => {
      const request = freshRequest() as Record<string, unknown>;

      await build(stale()).intercept(contextFor(request), nextHandler);

      expect(request.user).toBeUndefined();
    },
  );

  it.each(interceptors)(
    "%s still exposes the user of the current session",
    async (_name, build) => {
      const request = freshRequest() as Record<string, unknown>;

      await build(current()).intercept(contextFor(request), nextHandler);

      expect(request.user).toBe(USER);
    },
  );
});
