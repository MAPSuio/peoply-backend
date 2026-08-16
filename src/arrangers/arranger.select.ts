import { Prisma } from "../generated/prisma/client";
import { PUBLIC_USER_SELECT } from "../users/user.select";

/**
 * The shape an `Arranger` takes wherever an event is served with its
 * arrangers: `GET /events`, `GET /events/:urlId`, the public arm of the
 * arranger lookup, and (through `eventCardInclude`) the user's own favorites
 * and registrations lists.
 *
 * `organization` is narrowed here even though the same row is public via
 * `GET /organizations/:orgId`, because the public call sites had already
 * agreed on the five fields and widening them is not this change's business.
 * `user` goes through {@link PUBLIC_USER_SELECT} — the same boundary every
 * other endpoint returning someone else's row is held to.
 */
export const PUBLIC_ARRANGER_INCLUDE = {
  user: { select: PUBLIC_USER_SELECT },
  organization: {
    select: {
      id: true,
      urlId: true,
      name: true,
      image: true,
      orgNr: true,
    },
  },
} satisfies Prisma.ArrangerInclude;
