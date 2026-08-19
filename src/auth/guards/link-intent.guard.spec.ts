import { ExecutionContext } from "@nestjs/common";
import { ClearLinkIntentGuard, LinkIntentGuard } from "./link-intent.guard";

const contextFor = (req: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

/**
 * Link intent lives in the same express session that carries the OAuth state,
 * and both login and link entry points run before a redirect leaves for the
 * IdP. What each of them leaves in the session is the entire difference
 * between "log this person in" and "attach this identity to user X" at the
 * callback — so a stale key is not clutter, it is a mislinked account.
 */
describe("LinkIntentGuard", () => {
  it("binds the intent to the authenticated user", () => {
    const req = { user: { id: "user-1" }, session: {} as any };

    expect(new LinkIntentGuard().canActivate(contextFor(req))).toBe(true);
    expect(req.session.linkUserId).toBe("user-1");
  });

  it("drops a stale pending link so it cannot ride along", () => {
    const req = {
      user: { id: "user-1" },
      session: { pendingLink: { sub: "old" } } as any,
    };

    new LinkIntentGuard().canActivate(contextFor(req));

    expect(req.session.pendingLink).toBeUndefined();
  });
});

describe("ClearLinkIntentGuard", () => {
  it("drops a stale link intent before a plain login", () => {
    const req = { session: { linkUserId: "user-1" } as any };

    expect(new ClearLinkIntentGuard().canActivate(contextFor(req))).toBe(true);
    expect(req.session.linkUserId).toBeUndefined();
  });

  /* The confirm re-auth IS a plain login: the pending link must survive it. */
  it("preserves a pending link", () => {
    const pendingLink = { sub: "sub-g" };
    const req = { session: { linkUserId: "user-1", pendingLink } as any };

    new ClearLinkIntentGuard().canActivate(contextFor(req));

    expect(req.session.pendingLink).toBe(pendingLink);
  });

  it("tolerates a request with no session at all", () => {
    expect(new ClearLinkIntentGuard().canActivate(contextFor({}))).toBe(true);
  });
});
