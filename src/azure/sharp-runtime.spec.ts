import sharp from "./sharp-runtime";

describe("sharp runtime", () => {
  it("retains no decoded image data between uploads", () => {
    expect(sharp.cache()).toMatchObject({
      memory: { max: 0 },
      files: { max: 0 },
      items: { max: 0 },
    });
  });

  it("decodes one image at a time", () => {
    expect(sharp.concurrency()).toBe(1);
  });
});
