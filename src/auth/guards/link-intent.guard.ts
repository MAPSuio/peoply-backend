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
 * The mirror image, for the two plain login endpoints: a link intent from an
 * abandoned settings flow would otherwise turn the next ordinary login in the
 * same browser into a link. The pending link is deliberately kept — the
 * confirm re-auth of the link modal IS a plain login.
 */
@Injectable()
export class ClearLinkIntentGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    if (req.session) {
      delete req.session.linkUserId;
    }

    return true;
  }
}
