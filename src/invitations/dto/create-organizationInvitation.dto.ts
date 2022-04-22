import { OrganizationRole } from ".prisma/client";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";

export class CreateOrganizationInvitationDto {
  @IsNotEmpty()
  @IsUUID(4)
  userId: string;

  @IsNotEmpty()
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
