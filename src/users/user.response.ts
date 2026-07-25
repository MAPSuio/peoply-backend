/**
 * Strips `refreshTokenId` from a user row that is about to be serialised into a
 * response body.
 *
 * This is the caller's *own* row, so the field is not a credential belonging to
 * anyone else, and on its own it cannot be exchanged for a session: minting a
 * refresh token requires `JWT_REFRESH_TOKEN_SECRET`, which never leaves the
 * server. What it is, is the value `AuthService.getRefreshToken` signs in as
 * `tokenId` and `RefreshStrategy` compares against — the handle that makes a
 * session revocable. It has no business being readable by page scripts, browser
 * extensions or anything else that can see a response body, and no client asks
 * for it.
 *
 * `PUBLIC_USER_SELECT` is the equivalent boundary for *other* people's rows;
 * this one is deliberately a subtraction rather than a whitelist, because the
 * settings page legitimately reads almost every other column and a whitelist
 * here would have to be widened on every schema addition.
 */
export const withoutRefreshTokenId = <
  T extends { refreshTokenId?: string | null },
>(
  user: T,
): Omit<T, "refreshTokenId"> => {
  const { refreshTokenId: _refreshTokenId, ...rest } = user;
  return rest;
};
