/**
 * How many images may be decoded at once, process-wide.
 *
 * One. Peak RSS for a legal upload, measured after the `stats()` fix and with
 * the edge ceiling in place, is 238 MB against a 512 MB container with a
 * 192 MB heap. Two at a time is 396 MB and three does not fit, and "does not
 * fit" here means the platform kills the container and every request in it,
 * not that one upload fails.
 *
 * The decode is 0.8 s at that size, so serialising costs a queued uploader
 * under a second. Production has stored 663 images in its lifetime; two of
 * them arriving in the same second is not a load pattern, it is an attack.
 */
export const MAX_CONCURRENT_DECODES = 1;

/**
 * How many may wait for the slot before we start refusing.
 *
 * Waiting is not free: multer has already read the whole upload into memory by
 * the time we are called, so each waiter is holding up to `MAX_IMAGE_BYTES`
 * that we are keeping alive by making it queue. Two waiters is 60 MB held
 * alongside the 238 MB decode, which fits; an unbounded queue is just the
 * original problem with extra steps.
 */
export const MAX_QUEUED_DECODES = 2;

/**
 * Thrown when the queue is full. Distinct from the refusals in
 * `image-normalize`, because those are about the image and this is about us:
 * the same upload will work a second later, so it deserves a 503 and not a
 * 400.
 */
export class DecoderBusyError extends Error {
  constructor() {
    super(
      "We are processing too many images right now. Wait a moment and try " +
        "again.",
    );
    this.name = "DecoderBusyError";
  }
}

let running = 0;
const waiting: (() => void)[] = [];

/**
 * Runs `work` with at most `MAX_CONCURRENT_DECODES` others, refusing rather
 * than queueing without limit.
 *
 * Process-wide singleton state on purpose: the thing being rationed is the
 * container's memory, and there is exactly one of those. Passing a slot pool
 * in would let a caller construct its own and hand itself a second one.
 */
export async function runOnDecodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_DECODES) {
    if (waiting.length >= MAX_QUEUED_DECODES) {
      throw new DecoderBusyError();
    }

    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  }

  running += 1;

  try {
    return await work();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}
