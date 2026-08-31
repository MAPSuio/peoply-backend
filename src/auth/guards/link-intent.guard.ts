import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

/**
 * Writes the link intent into the express session before the provider guard
 * to the right of it redirects to the IdP. Must sit after AuthenticatedGuard
 * (which puts the user on the request) and before VippsGuard/GoogleGuard
 * (whose canActivate never returns control — it ends in the redirect).
 */
@Injectable()
export class LinkIntentGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    req.session.linkUserId = req.user.id;
    // A pending link left over from an abandoned login prompt must not ride
    // along into a deliberate settings-initiated flow.
    delete req.session.pendingLink;

    return true;
  }
}

/**
 * A login the person started themselves begins on a session id nobody else
 * could know, so anything an attacker planted in the browser — a link intent
 * from an abandoned settings flow, or a pending link parked from their own
 * collision — is gone before the redirect to the IdP.
 */
@Injectable()
export class FreshLoginSessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    await regenerateSession(context.switchToHttp().getRequest());

    return true;
  }
}

/**
 * The confirm re-auth of the link modal, which is the one login that has to
 * keep the parked link. It gets its own entry point rather than being told
 * apart from an ordinary login after the fact: a planted session could
 * otherwise attach its own identity to whoever logs in next.
 */
@Injectable()
export class ConfirmLinkGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const pendingLink = req.session?.pendingLink;

    await regenerateSession(req);

    if (req.session && pendingLink) req.session.pendingLink = pendingLink;

    return true;
  }
}

function regenerateSession(req: {
  session?: { regenerate?: (done: (error?: Error) => void) => void };
}) {
  const session = req.session;

  if (!session?.regenerate) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    session.regenerate?.((error) => (error ? reject(error) : resolve()));
  });
}
