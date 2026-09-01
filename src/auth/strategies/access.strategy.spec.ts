import { AccessStrategy } from "./access.strategy";

describe("AccessStrategy", () => {
  it("decides nothing itself and asks the session service", async () => {
    const user = { id: "user-1" };
    const accessSession = { userFromPayload: jest.fn(async () => user) };
    const configService = { getOrThrow: () => "access-secret" };

    const strategy = new AccessStrategy(
      configService as never,
      accessSession as never,
    );

    await expect(
      strategy.validate({ sub: "user-1", sid: "session-1" }),
    ).resolves.toBe(user);
    expect(accessSession.userFromPayload).toHaveBeenCalledWith({
      sub: "user-1",
      sid: "session-1",
    });
  });
});
