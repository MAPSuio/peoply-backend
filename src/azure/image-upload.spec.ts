import { BadRequestException } from "@nestjs/common";
import {
  assertIsImage,
  detectImageType,
  extensionFor,
  IMAGE_UPLOAD_OPTIONS,
  MAX_IMAGE_BYTES,
} from "./image-upload";

const png = (...tail: number[]) =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...tail]);
const jpeg = (...tail: number[]) => Buffer.from([0xff, 0xd8, 0xff, ...tail]);

describe("detectImageType", () => {
  it("recognises a PNG by its signature", () => {
    expect(detectImageType(png(0x00, 0x00, 0x00, 0x0d))).toBe("image/png");
  });

  it("recognises a JPEG by its signature", () => {
    expect(detectImageType(jpeg(0xe0, 0x00, 0x10))).toBe("image/jpeg");
  });

  it("rejects a Windows executable", () => {
    // MZ header — what an attacker sends as `file.exe;type=image/png`.
    expect(detectImageType(Buffer.from("MZ\x90\x00\x03\x00\x00\x00"))).toBe(
      null,
    );
  });

  it("rejects an SVG, which is script-capable in a browser", () => {
    expect(
      detectImageType(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/>'),
      ),
    ).toBe(null);
  });

  it("rejects HTML", () => {
    expect(detectImageType(Buffer.from("<!DOCTYPE html><html>"))).toBe(null);
  });

  it("rejects a buffer shorter than the signature it starts to match", () => {
    // subarray() silently returns a short buffer, so a naive prefix compare
    // would read this as a JPEG.
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBe(null);
  });

  it("rejects an empty buffer", () => {
    expect(detectImageType(Buffer.alloc(0))).toBe(null);
  });

  it("rejects a file that merely contains a PNG signature further in", () => {
    expect(detectImageType(Buffer.concat([Buffer.from("GIF89a"), png()]))).toBe(
      null,
    );
  });
});

describe("assertIsImage", () => {
  it("returns the sniffed type for a real image", () => {
    expect(assertIsImage(png())).toBe("image/png");
    expect(assertIsImage(jpeg())).toBe("image/jpeg");
  });

  it("throws BadRequest for anything else", () => {
    expect(() => assertIsImage(Buffer.from("MZ\x90\x00"))).toThrow(
      BadRequestException,
    );
  });
});

describe("extensionFor", () => {
  it("maps the two allowed types to a fixed extension", () => {
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });
});

describe("IMAGE_UPLOAD_OPTIONS", () => {
  const runFilter = (mimetype: string) => {
    const callback = jest.fn();
    // multer's file type is structural; only mimetype is read here.
    IMAGE_UPLOAD_OPTIONS.fileFilter?.({} as any, { mimetype } as any, callback);
    return callback;
  };

  it("caps a single file at 5 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(IMAGE_UPLOAD_OPTIONS.limits?.fileSize).toBe(MAX_IMAGE_BYTES);
    expect(IMAGE_UPLOAD_OPTIONS.limits?.files).toBe(1);
  });

  it("accepts the two image content types", () => {
    expect(runFilter("image/png")).toHaveBeenCalledWith(null, true);
    expect(runFilter("image/jpeg")).toHaveBeenCalledWith(null, true);
  });

  it("rejects any other content type before a byte is buffered", () => {
    const callback = runFilter("application/octet-stream");
    expect(callback).toHaveBeenCalledWith(
      expect.any(BadRequestException),
      false,
    );
  });
});
