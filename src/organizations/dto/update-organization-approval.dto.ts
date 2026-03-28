import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class UpdateOrganizationApprovalDto {
  @IsBoolean()
  @ApiProperty()
  approved: boolean;
}
