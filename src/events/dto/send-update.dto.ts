import { ApiProperty } from "@nestjs/swagger";
import { EventUpdateVisibility } from "../../generated/prisma/client";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

/** Matches Event.title, which shares the heading these end up beside. */
const MAX_SUBJECT_LENGTH = 150;
/** An announcement to attendees, not a document. */
const MAX_BODY_LENGTH = 5000;
/** RFC 5321 caps an address at 254 octets. */
const MAX_EMAIL_LENGTH = 254;

export class SendUpdateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(MAX_SUBJECT_LENGTH)
  @ApiProperty({ maxLength: MAX_SUBJECT_LENGTH })
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(MAX_BODY_LENGTH)
  @ApiProperty({ maxLength: MAX_BODY_LENGTH })
  body: string;

  /**
   * Becomes the Reply-To on mail sent as `no-reply@peoply.app`, and the one
   * attacker-supplied `href` in the template (`mailto:${replyTo}`).
   *
   * `@IsString()` alone let an arranger point replies at any address they
   * liked while the message carried our sending identity, and let a value
   * containing a quote break out of the href attribute.
   */
  @IsOptional()
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  @ApiProperty({ required: false, format: "email" })
  replyTo?: string;

  @IsNotEmpty()
  @IsEnum(EventUpdateVisibility)
  @ApiProperty()
  visibility: EventUpdateVisibility;

  @IsNotEmpty()
  @ToBoolean()
  @IsBoolean()
  @ApiProperty()
  sendEmail: boolean;
}
