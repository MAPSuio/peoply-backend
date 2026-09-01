import { BadRequestException } from "@nestjs/common";
import { getMetadataStorage } from "class-validator";
import { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

/**
 * Shared configuration and validation for the four image upload endpoints
 * (profile image, event image on create and on update, organization image).
 *
 * Each of them used to carry its own copy of the same `fileFilter` and limit.
 */

/**
 * The point past which we stop accepting bytes at all.
 *
 * This is not a statement about what a reasonable image is. Every upload is
 * downscaled to `MAX_IMAGE_EDGE_PX` on the way to storage, so what a user sends
 * has almost nothing to do with what we keep: the 9.2 MB camera original that
 * broke a profile picture in production comes out the other side at 255 kB.
 * Rejecting the photo the phone actually took, to protect a limit that the very
 * next step makes irrelevant, is the wrong trade - a phone photo is routinely
 * over 5 MB, and "File too large" is a dead end for someone who only wanted an
 * avatar.
 *
 * What it does bound is heap. No `storage` is passed to FileInterceptor, so
 * multer uses memoryStorage and the whole file lands in `file.buffer` before it
 * is handed to sharp. 30 MB sits above every phone photo and full-screen PNG
 * anyone will realistically upload, while keeping the worst case bounded on a
 * 1 GB container.
 */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * `file.mimetype` is the Content-Type of the multipart part - a header the
 * uploader writes. It says what the client claims, so it is worth rejecting on
 * early, but it is not evidence of anything.
 */
const MAX_IMAGE_FILES = 1;

export const MAX_FIELD_BYTES = 64 * 1024;

/**
 * Room above the DTO for fields a client sends that validation then strips.
 * The bound that actually stops a flood is `fields * MAX_FIELD_BYTES`, so
 * headroom is cheap; a limit below the route's own contract is not.
 */
export const MULTIPART_FIELD_HEADROOM = 8;

const rejectAnythingButAnImage: MulterOptions["fileFilter"] = (
  _req,
  file,
  callback,
) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype as AllowedMimeType)) {
    callback(
      new BadRequestException("Only .jpeg and .png files are allowed!"),
      false,
    );
    return;
  }

  callback(null, true);
};

type UploadDto = new (...args: never[]) => object;

function acceptedFieldCount(dto: UploadDto): number {
  const names = new Set<string>();

  for (const metadata of getMetadataStorage().getTargetValidationMetadatas(
    dto,
    "",
    true,
    false,
  )) {
    names.add(metadata.propertyName);
  }

  return names.size;
}

/**
 * Multipart limits for a route, derived from the DTO that route accepts.
 *
 * Multer counts parts before validation runs, so a field limit chosen by hand
 * silently overrides the DTO: a limit of 16 against the 29 fields
 * `UpdateEventDto` accepts made every event save answer 400, because the edit
 * form submits its whole state on every save. Deriving the limit from the DTO
 * is what makes that unrepresentable - the bound can no longer fall below the
 * contract it is bounding.
 */
export function imageUploadOptionsFor(dto: UploadDto): MulterOptions {
  const fields = acceptedFieldCount(dto) + MULTIPART_FIELD_HEADROOM;

  return {
    fileFilter: rejectAnythingButAnImage,
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: MAX_IMAGE_FILES,
      fields,
      parts: fields + MAX_IMAGE_FILES,
      fieldSize: MAX_FIELD_BYTES,
    },
  };
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Identifies an image by its leading bytes rather than by what the uploader
 * said it was. Returns null when the content is neither.
 */
export function detectImageType(buffer: Buffer): AllowedMimeType | null {
  if (buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "image/png";
  }

  if (buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return "image/jpeg";
  }

  return null;
}

/**
 * The content check the mimetype filter cannot do.
 *
 * Nothing inspected the bytes, so `-F "profileImage=@malware.exe;type=image/png"`
 * was stored and served from a domain we control - free hosting for malware or
 * phishing, and abuse complaints landing on our storage account.
 */
export function assertIsImage(buffer: Buffer): AllowedMimeType {
  const detected = detectImageType(buffer);

  if (!detected) {
    throw new BadRequestException(
      "Uploaded file is not a valid .jpeg or .png image",
    );
  }

  return detected;
}

export function extensionFor(mimeType: AllowedMimeType) {
  return mimeType === "image/png" ? "png" : "jpg";
}
