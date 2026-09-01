import { MENTION_COOLDOWN_MS, MentionCooldown } from "./mention-cooldown";

const MENTION_KEY = "alert:mention";

function storeThatCounts() {
  const counts = new Map<string, number>();

  return {
    counts,
    increment: jest.fn(async (key: string) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, resetAtMs: MENTION_COOLDOWN_MS };
    }),
  };
}

describe("MentionCooldown", () => {
  it("lets the first alert of a window ping everyone", async () => {
    const cooldown = new MentionCooldown(storeThatCounts() as never, {
      now: () => 0,
    });

    await expect(cooldown.mayMention()).resolves.toBe(true);
  });

  it("keeps later alerts in the same window quiet", async () => {
    const cooldown = new MentionCooldown(storeThatCounts() as never, {
      now: () => 0,
    });

    await cooldown.mayMention();

    await expect(cooldown.mayMention()).resolves.toBe(false);
    await expect(cooldown.mayMention()).resolves.toBe(false);
  });

  it("counts one window for the whole deployment, not one per reporter", async () => {
    const store = storeThatCounts();
    const cooldown = new MentionCooldown(store as never, { now: () => 0 });

    await cooldown.mayMention();
    await cooldown.mayMention();

    expect([...store.counts.keys()]).toEqual([MENTION_KEY]);
  });

  it("stays quiet when the store cannot say, since a ping cannot be taken back", async () => {
    const failing = {
      increment: jest.fn().mockRejectedValue(new Error("store down")),
    };
    const cooldown = new MentionCooldown(failing as never, { now: () => 0 });

    await expect(cooldown.mayMention()).resolves.toBe(false);
  });
});
