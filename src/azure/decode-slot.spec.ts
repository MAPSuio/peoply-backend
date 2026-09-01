import {
  DecoderBusyError,
  MAX_QUEUED_DECODES,
  runOnDecodeSlot,
} from "./decode-slot";

const settle = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let release!: () => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    release = () => resolve();
    fail = reject;
  });

  return { promise, release, fail };
}

describe("decode slot", () => {
  it("runs one decode at a time", async () => {
    const first = deferred();
    const second = deferred();
    let running = 0;
    let highWaterMark = 0;

    const track = (gate: Promise<void>) => async () => {
      running += 1;
      highWaterMark = Math.max(highWaterMark, running);
      await gate;
      running -= 1;
    };

    const both = Promise.all([
      runOnDecodeSlot(track(first.promise)),
      runOnDecodeSlot(track(second.promise)),
    ]);

    await settle();
    first.release();
    await settle();
    second.release();
    await both;

    expect(highWaterMark).toBe(1);
  });

  it("refuses the caller that arrives past the queue", async () => {
    const held = deferred();
    const inFlight = [
      runOnDecodeSlot(() => held.promise),
      ...Array.from({ length: MAX_QUEUED_DECODES }, () =>
        runOnDecodeSlot(() => held.promise),
      ),
    ];

    await settle();

    await expect(runOnDecodeSlot(async () => undefined)).rejects.toThrow(
      DecoderBusyError,
    );

    held.release();
    await Promise.all(inFlight);
  });

  it("frees the slot when the decode throws", async () => {
    const failing = deferred();

    const rejected = runOnDecodeSlot(() => failing.promise);
    await settle();
    failing.fail(new Error("decode blew up"));
    await expect(rejected).rejects.toThrow("decode blew up");

    await expect(runOnDecodeSlot(async () => "free")).resolves.toBe("free");
  });

  it("hands back what the decode returned", async () => {
    await expect(runOnDecodeSlot(async () => 42)).resolves.toBe(42);
  });
});
