import { collectRefreshCookies, pickRefreshToken } from "./refresh-cookie";

const jwtWithExp = (expSecondsFromNow: number) => {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "user-1",
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    }),
  ).toString("base64url");

  return `header.${payload}.signature`;
};

describe("collectRefreshCookies", () => {
  it("returns every refresh cookie in header order", () => {
    expect(collectRefreshCookies("refresh=old; access=x; refresh=new")).toEqual(
      ["old", "new"],
    );
  });

  it("ignores other cookies and empty values", () => {
    expect(collectRefreshCookies("access=x; refresh=; connect.sid=y")).toEqual(
      [],
    );
  });

  it("returns empty for a missing header", () => {
    expect(collectRefreshCookies(undefined)).toEqual([]);
  });

  it("does not match cookie names that merely start with refresh", () => {
    expect(collectRefreshCookies("refreshToken=zzz; refresh=abc")).toEqual([
      "abc",
    ]);
  });
});

describe("pickRefreshToken", () => {
  it("returns the only cookie when there is one", () => {
    const token = jwtWithExp(3600);
    expect(pickRefreshToken(`refresh=${token}`)).toBe(token);
  });

  it("skips an expired legacy duplicate in favour of a valid one", () => {
    // The pre-2026-03-23 cookie (path /auth/refresh) sorts before the
    // current one (path /auth) per RFC 6265 §5.4 — exactly this order.
    const legacy = jwtWithExp(-3600);
    const current = jwtWithExp(3600);

    expect(pickRefreshToken(`refresh=${legacy}; refresh=${current}`)).toBe(
      current,
    );
  });

  it("falls back to the first cookie when every candidate is expired", () => {
    const first = jwtWithExp(-7200);
    const second = jwtWithExp(-3600);

    expect(pickRefreshToken(`refresh=${first}; refresh=${second}`)).toBe(first);
  });

  it("prefers a readable unexpired JWT over garbage", () => {
    const valid = jwtWithExp(3600);

    expect(pickRefreshToken(`refresh=not-a-jwt; refresh=${valid}`)).toBe(valid);
  });

  it("still returns garbage when it is the only candidate", () => {
    // Passport must keep rejecting it with the same error as before.
    expect(pickRefreshToken("refresh=not-a-jwt")).toBe("not-a-jwt");
  });

  it("returns undefined when no refresh cookie is present", () => {
    expect(pickRefreshToken("access=x")).toBeUndefined();
    expect(pickRefreshToken(undefined)).toBeUndefined();
  });
});
