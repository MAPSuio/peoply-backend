import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

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

  @IsOptional()
  @IsString()
  @ApiProperty()
  @MaxLength(300)
  description?: string;
}
