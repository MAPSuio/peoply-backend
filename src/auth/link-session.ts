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
  parkedAt: number;
}

/**
 * How long the confirm modal stays answerable. A parked link is an identity
 * waiting to be attached to an account, so it should not outlive the sitting
 * in which it was offered.
 */
export const PENDING_LINK_MAX_AGE_MS = 10 * 60 * 1000;

/** The link state account linking keeps in the express oauth session. */
export interface LinkSessionKeys {
  /** Settings-initiated link: attach the next callback's identity to this user. */
  linkUserId?: string;
  /** Login-time collision waiting for the owner to re-authenticate. */
  pendingLink?: PendingLink;
}

declare module "express-session" {
  // biome-ignore lint/suspicious/noEmptyInterface: declaration merging.
  interface SessionData extends LinkSessionKeys {}
}

/*
 * The link keys are single-use by nature — a consumed intent that lingers
 * would turn some later, unrelated login into a link. Hence read-and-delete.
 */

export const takeLinkUserId = (session: LinkSessionKeys | undefined) => {
  const linkUserId = session?.linkUserId;
  if (session) delete session.linkUserId;
  return linkUserId;
};

export const takePendingLink = (
  session: LinkSessionKeys | undefined,
  nowMs: number,
) => {
  const pendingLink = session?.pendingLink;
  if (session) delete session.pendingLink;

  if (!pendingLink) return undefined;

  const age = nowMs - pendingLink.parkedAt;

  return age >= 0 && age <= PENDING_LINK_MAX_AGE_MS ? pendingLink : undefined;
};
