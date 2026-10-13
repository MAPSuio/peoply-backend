import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from "@nestjs/common";
import { Response } from "express";

import { MAX_IMAGE_BYTES } from "./image-upload";

/**
 * Replaces multer's wording on an oversized upload.
 *
 * `@nestjs/platform-express` maps multer's `LIMIT_FILE_SIZE` to a
 * `PayloadTooLargeException` carrying multer's own message, which is the
 * string "File too large". The status is right; the message tells the user
 * nothing - not what the limit is, not that anything can be done about it.
 *
 * Almost nobody should reach this now that `MAX_IMAGE_BYTES` is 30 MB and
 * everything under it is downscaled rather than refused. That is the point:
 * this is the message for the case we did not anticipate, so it should say
 * where the wall is instead of just that one was hit.
 */
@Catch(PayloadTooLargeException)
export class UploadSizeFilter implements ExceptionFilter {
  private readonly limitMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message:
        `That file is larger than ${this.limitMb} MB. Images are resized ` +
        "automatically, so a photo straight from your phone is fine - this " +
        "is only for something much bigger than that.",
      error: "Payload Too Large",
    });
  }
}
