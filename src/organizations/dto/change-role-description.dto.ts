import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ChangeRoleDescriptionDTO {
  @IsOptional()
  @IsString()
  @ApiProperty()
  description?: string;
}
