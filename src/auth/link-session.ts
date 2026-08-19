import { Provider } from "../generated/prisma/client";
import { CreateUserDto } from "../users/dto";

/**
 * A provider identity that authenticated at login but collided with an
 * existing account on email. It sits in the express session until the person
 * proves they own that account by logging in with one of its providers —
 * the "confirm" of the link modal — or until the session's ttl runs out.
 */
export interface PendingLink {
  provider: Provider;
  sub: string;
  profile: CreateUserDto;
  matchedUserId: string;
}

declare module "express-session" {
  interface SessionData {
    /** Settings-initiated link: attach the next callback's identity to this user. */
    linkUserId?: string;
    /** Login-time collision waiting for the owner to re-authenticate. */
    pendingLink?: PendingLink;
  }
}

/**
 * The link keys are single-use by nature — a consumed intent that lingers
 * would turn some later, unrelated login into a link. Hence read-and-delete.
 */
type LinkSession =
  | { linkUserId?: string; pendingLink?: PendingLink }
  | undefined;

export const takeLinkUserId = (session: LinkSession) => {
  const linkUserId = session?.linkUserId;
  if (session) delete session.linkUserId;
  return linkUserId;
};

export const takePendingLink = (session: LinkSession) => {
  const pendingLink = session?.pendingLink;
  if (session) delete session.pendingLink;
  return pendingLink;
};
