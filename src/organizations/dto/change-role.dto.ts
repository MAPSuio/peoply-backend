import { OrganizationRole } from "../../generated/prisma/client";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";

export class ChangeRoleDto {
  @IsNotEmpty()
  @IsUUID(4)
  userId: string;

  @IsNotEmpty()
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
