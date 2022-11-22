import { InvitationStatus } from ".prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateInvitationDto {
  @IsNotEmpty()
  @IsEnum(InvitationStatus)
  status: InvitationStatus;

  @IsOptional()
  @IsString()
  formAnswer?: string;
}
