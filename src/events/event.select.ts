import { Prisma } from "../generated/prisma/client";
import { PUBLIC_ARRANGER_INCLUDE } from "../arrangers/arranger.select";

/**
 * The shape an event takes when it rides along on a row in someone's own list
 * — `GET /users/:userId/favorites` and `GET /users/:userId/registrations` —
 * gated by the `includeEvent`/`includeArrangers` flags those endpoints share.
 *
 * Both call sites used to carry this tree inline, byte-identical to each
 * other but drifted from {@link PUBLIC_ARRANGER_INCLUDE}: their arranger came
 * back with fewer fields than the same arranger on `GET /events`. One shape
 * here means arranger.select.spec.ts guards these two endpoints along with
 * the public ones, and any future field decision happens in one module.
 */
export function eventCardInclude(flags: {
  includeEvent?: boolean;
  includeArrangers?: boolean;
}) {
  if (!flags.includeEvent) {
    return false as const;
  }

  return {
    include: {
      eventArrangers: flags.includeArrangers
        ? { include: { arranger: { include: PUBLIC_ARRANGER_INCLUDE } } }
        : (false as const),
    } satisfies Prisma.EventInclude,
  };
}
