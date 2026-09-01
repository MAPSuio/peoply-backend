import { UnauthorizedException } from "@nestjs/common";
import { AuthenticatedInterceptor } from "./authenticated.interceptor";

describe("AuthenticatedInterceptor", () => {
  const user = { id: "user-1" };
  const next = { handle: jest.fn(() => "stream") } as never;

  function intercept(userFromRequest: jest.Mock) {
    const request: Record<string, unknown> = { cookies: { access: "token" } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const interceptor = new AuthenticatedInterceptor({
      userFromRequest,
    } as never);

    return { request, handled: interceptor.intercept(context, next) };
  }

  it("exposes the user of a live session on the request", async () => {
    const { request, handled } = intercept(jest.fn(async () => user));

    await expect(handled).resolves.toBe("stream");
    expect(request.user).toBe(user);
  });

  it("leaves the request anonymous when the session no longer resolves", async () => {
    const { request, handled } = intercept(
      jest.fn(async () => {
        throw new UnauthorizedException();
      }),
    );

    await expect(handled).resolves.toBe("stream");
    expect(request.user).toBeUndefined();
  });
});
