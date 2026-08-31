import { ExecutionContext } from "@nestjs/common";
import {
  ConfirmLinkGuard,
  FreshLoginSessionGuard,
  LinkIntentGuard,
} from "./link-intent.guard";

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

function sessionThatRegenerates() {
  const session: Record<string, unknown> & {
    regenerate: (done: (error?: Error) => void) => void;
    regenerated: number;
  } = {
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
}

/**
 * A login the person started themselves must not inherit anything an attacker
 * left in the session, so it starts from a session id nobody else could know.
 * The confirm re-auth of the link modal is the one login that has to keep the
 * parked link, which is why it has its own entry point rather than being told
 * apart from an ordinary login after the fact.
 */
describe("FreshLoginSessionGuard", () => {
  it("drops a link parked in a session the caller did not start", async () => {
    const session = sessionThatRegenerates();
    session.pendingLink = { sub: "sub-g", matchedUserId: "victim-1" };
    session.linkUserId = "attacker-1";

    await new FreshLoginSessionGuard().canActivate(contextFor({ session }));

    expect(session.pendingLink).toBeUndefined();
    expect(session.linkUserId).toBeUndefined();
    expect(session.regenerated).toBe(1);
  });

  it("tolerates a request with no session at all", async () => {
    await expect(
      new FreshLoginSessionGuard().canActivate(contextFor({})),
    ).resolves.toBe(true);
  });
});

describe("ConfirmLinkGuard", () => {
  it("carries the parked link across a fresh session id", async () => {
    const session = sessionThatRegenerates();
    const pendingLink = { sub: "sub-g", matchedUserId: "user-1" };
    session.pendingLink = pendingLink;
    session.linkUserId = "stale-intent";

    await new ConfirmLinkGuard().canActivate(contextFor({ session }));

    expect(session.pendingLink).toEqual(pendingLink);
    expect(session.linkUserId).toBeUndefined();
    expect(session.regenerated).toBe(1);
  });

  it("has nothing to carry when no link was parked", async () => {
    const session = sessionThatRegenerates();

    await new ConfirmLinkGuard().canActivate(contextFor({ session }));

    expect(session.pendingLink).toBeUndefined();
  });
});
