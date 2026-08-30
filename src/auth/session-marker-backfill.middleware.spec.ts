import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { SessionMarkerBackfillMiddleware } from "./session-marker-backfill.middleware";

describe("SessionMarkerBackfillMiddleware", () => {
  const markerCookieOptions = { httpOnly: false, maxAge: 1000 };

  let written: Array<[string, string, unknown]>;
  let res: Response;
  let next: jest.Mock;

  const authService = {
    getSessionMarkerCookieOptions: jest.fn(() => markerCookieOptions),
  } as unknown as AuthService;

  const middleware = new SessionMarkerBackfillMiddleware(authService);

  const request = (cookies: Record<string, string>) =>
    ({ cookies }) as unknown as Request;

  beforeEach(() => {
    written = [];
    next = jest.fn();
    res = {
      cookie: (name: string, value: string, options: unknown) => {
        written.push([name, value, options]);
        return res;
      },
    } as unknown as Response;
  });

  it("gives a session that predates the marker one on the next request", () => {
    middleware.use(request({ access: "an-access-token" }), res, next);

    expect(written).toEqual([["has_session", "1", markerCookieOptions]]);
    expect(next).toHaveBeenCalled();
  });

  it("also heals a session whose access token has already expired", () => {
    middleware.use(request({ refresh: "a-refresh-token" }), res, next);

    expect(written).toEqual([["has_session", "1", markerCookieOptions]]);
  });

  it("leaves a request that already carries the marker alone", () => {
    middleware.use(
      request({ access: "an-access-token", has_session: "1" }),
      res,
      next,
    );

    expect(written).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("does not hand a marker to someone who has no session at all", () => {
    middleware.use(request({}), res, next);

    expect(written).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("survives a request that was never parsed for cookies", () => {
    middleware.use({} as Request, res, next);

    expect(written).toEqual([]);
    expect(next).toHaveBeenCalled();
  });
});
