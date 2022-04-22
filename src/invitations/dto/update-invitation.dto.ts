import { InvitationStatus } from ".prisma/client";
import { IsEnum, IsNotEmpty } from "class-validator";

export class UpdateInvitationDto {
  @IsNotEmpty()
  @IsEnum(InvitationStatus)
  status: InvitationStatus;
}
