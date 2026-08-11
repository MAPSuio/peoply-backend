import { isUntrustedOrigin } from "./auth-origin";
import { isLoopbackAddress } from "./local-auth";

const TRUSTED = ["https://peoply.app"];

describe("isUntrustedOrigin", () => {
  it("allows a state-changing request from a trusted origin", () => {
    expect(
      isUntrustedOrigin("POST", "/events", true, "https://peoply.app", TRUSTED),
    ).toBe(false);
  });

  it("rejects a state-changing request from an untrusted origin", () => {
    expect(
      isUntrustedOrigin(
        "POST",
        "/events",
        true,
        "https://evil.example",
        TRUSTED,
      ),
    ).toBe(true);
  });

  it("rejects a state-changing cookie request with no origin at all", () => {
    // The fail-open this replaces: `requestOrigin` was one of the ANDs, so a
    // missing Origin *and* Referer skipped the check entirely. Production
    // cookies are sameSite: "none", so the browser does attach them
    // cross-site and this check is all there is.
    expect(isUntrustedOrigin("POST", "/events", true, undefined, TRUSTED)).toBe(
      true,
    );
  });

  it.each(["PATCH", "PUT", "DELETE"])(
    "rejects an originless %s too",
    (method) => {
      expect(
        isUntrustedOrigin(method, "/events/1", true, undefined, TRUSTED),
      ).toBe(true);
    },
  );

  it("lets reads through regardless of origin", () => {
    expect(
      isUntrustedOrigin(
        "GET",
        "/events",
        true,
        "https://evil.example",
        TRUSTED,
      ),
    ).toBe(false);
    expect(isUntrustedOrigin("HEAD", "/events", true, undefined, TRUSTED)).toBe(
      false,
    );
    expect(
      isUntrustedOrigin("OPTIONS", "/events", true, undefined, TRUSTED),
    ).toBe(false);
  });

  it("ignores requests that carry no auth cookie", () => {
    // Nothing to ride on, so there is no cross-site request forgery to do.
    expect(
      isUntrustedOrigin(
        "POST",
        "/events",
        false,
        "https://evil.example",
        TRUSTED,
      ),
    ).toBe(false);
  });

  it("exempts POST /auth/refresh, which the frontend calls from getServerSideProps", () => {
    // pages/events/[eid]/index.tsx forwards the visitor's cookies into
    // POST /auth/refresh from Node — no browser, so no Origin and no Referer.
    expect(
      isUntrustedOrigin("POST", "/auth/refresh", true, undefined, TRUSTED),
    ).toBe(false);
  });

  it("still holds /auth/refresh to the allowlist when an origin is present", () => {
    expect(
      isUntrustedOrigin(
        "POST",
        "/auth/refresh",
        true,
        "https://evil.example",
        TRUSTED,
      ),
    ).toBe(true);
  });

  it("does not extend the exemption to neighbouring paths", () => {
    expect(
      isUntrustedOrigin(
        "POST",
        "/auth/refresh/../login",
        true,
        undefined,
        TRUSTED,
      ),
    ).toBe(true);
    expect(
      isUntrustedOrigin("POST", "/auth/dev-login", true, undefined, TRUSTED),
    ).toBe(true);
  });

  it("cannot enforce anything without a configured origin list", () => {
    // Documents the remaining hole rather than pretending it is closed:
    // CORS_ORIGIN is Joi.required(), so an empty list means misconfiguration,
    // not a bypass an attacker can reach for.
    expect(isUntrustedOrigin("POST", "/events", true, undefined, [])).toBe(
      false,
    );
  });
});

describe("isLoopbackAddress", () => {
  it.each(["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1"])(
    "accepts %s",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(true);
    },
  );

  it.each([
    "10.0.0.1",
    "192.168.1.5",
    "8.8.8.8",
    "::ffff:8.8.8.8",
    "1.127.0.0",
    "2001:db8::1",
    "",
  ])("rejects %s", (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });

  it("rejects a missing address rather than defaulting to local", () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
  });
});
