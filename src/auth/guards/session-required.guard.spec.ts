import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { SessionRequiredGuard } from "./session-required.guard";
import { IS_PUBLIC_ROUTE } from "../public.decorator";

const USER = { id: "user-1" };

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWith(markedPublic: boolean, resolve: () => Promise<unknown>) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_ROUTE ? markedPublic : undefined,
  };

  return new SessionRequiredGuard(
    reflector as never,
    {
      userFromRequest: resolve,
    } as never,
  );
}

describe("SessionRequiredGuard", () => {
  const session = async () => USER;
  const noSession = async () => {
    throw new UnauthorizedException();
  };

  it("refuses a route nobody marked public when there is no session", async () => {
    await expect(
      guardWith(false, noSession).canActivate(contextFor({ cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("admits a route nobody marked public when the session holds", async () => {
    const request: Record<string, unknown> = { cookies: { access: "token" } };

    await expect(
      guardWith(false, session).canActivate(contextFor(request)),
    ).resolves.toBe(true);
    expect(request.user).toBe(USER);
  });

  it("lets a route through when it is marked public, session or not", async () => {
    await expect(
      guardWith(true, noSession).canActivate(contextFor({ cookies: {} })),
    ).resolves.toBe(true);
  });
});

