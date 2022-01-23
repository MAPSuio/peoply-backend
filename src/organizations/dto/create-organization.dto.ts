import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateOrganizationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  org_nr: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  image: string;
}
