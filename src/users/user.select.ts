import { Prisma } from "../generated/prisma/client";

/**
 * The only fields of a `User` that may be returned when the user in question is
 * not the requester.
 *
 * This exists as one definition rather than a literal repeated at each call
 * site because it is a security boundary, and three endpoints had already
 * drifted off it by including the relation as `user: true`. A full `User` row
 * carries `email`, `phone`, `birthDate`, `foodPreference`, the `allowEmail*`
 * flags and `refreshTokenId` — the last of which is signed into refresh tokens
 * as `tokenId` and is what makes a session revocable.
 *
 * Add a field here only if every consumer of every endpoint below may see it
 * for someone who is not themselves.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  image: true,
} satisfies Prisma.UserSelect;
