import { InvitationStatus } from "../../generated/prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { MAX_FORM_ANSWER_LENGTH } from "../../registrations/registration.constants";

export class UpdateInvitationDto {
  @IsNotEmpty()
  @IsEnum(InvitationStatus)
  status: InvitationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_FORM_ANSWER_LENGTH)
  formAnswer?: string;
}
