import { ApiProperty } from "@nestjs/swagger";
import { EventUpdateVisibility } from "../../generated/prisma/client";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

/* The form on /events/[eid]/update enforces 3-100 on the subject, 440 on the
   body and an email shape on replyTo - but only in the browser. The values go
   into an email sent BCC to every attendee, so the same limits belong here. */
export class SendUpdateDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @ApiProperty()
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(440)
  @ApiProperty()
  body: string;

  /* The form posts replyTo: "" whenever the e-post checkbox is off, and
     @IsOptional() only skips null/undefined - so an empty string has to be
     let through explicitly or every non-email update starts failing. */
  @ValidateIf((dto: SendUpdateDto) => Boolean(dto.replyTo))
  @IsEmail()
  @MaxLength(100)
  @ApiProperty()
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
