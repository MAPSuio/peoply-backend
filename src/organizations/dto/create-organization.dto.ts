import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateOrganizationDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  name: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  @ApiProperty()
  image?: string;
}
