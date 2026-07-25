import { withoutRefreshTokenId } from "./user.response";

describe("withoutRefreshTokenId", () => {
  /** A row shaped like what `AccessStrategy.validate` puts on `req.user`. */
  const userRow = () => ({
    id: "user-1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "+4712345678",
    birthDate: new Date("1815-12-10"),
    foodPreference: "VEGETARIAN",
    allowEmailPromotions: true,
    image: null,
    arrangerId: "arr-1",
    refreshTokenId: "session-handle-abc",
    userAllergens: [{ allergen: "NUTS" }],
    userSeenUpdates: [],
  });

  it("drops refreshTokenId", () => {
    expect(withoutRefreshTokenId(userRow())).not.toHaveProperty(
      "refreshTokenId",
    );
  });

  it("keeps every other field, including the private ones the owner may read", () => {
    const { refreshTokenId: _dropped, ...expected } = userRow();

    // Subtraction, not a whitelist: the settings page reads email, phone,
    // birthDate and the allowEmail flags, and a whitelist would silently drop
    // the next column someone adds to the schema.
    expect(withoutRefreshTokenId(userRow())).toEqual(expected);
  });

  it("does not mutate the row it was handed", () => {
    // `req.user` is shared with anything else in the request that reads it.
    const user = userRow();
    withoutRefreshTokenId(user);

    expect(user.refreshTokenId).toBe("session-handle-abc");
  });

  it("survives a row that has no refreshTokenId set", () => {
    const user = { ...userRow(), refreshTokenId: null };

    expect(withoutRefreshTokenId(user)).not.toHaveProperty("refreshTokenId");
  });
});
