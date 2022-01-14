import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateOrganizationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  org_nr: string;

  @IsOptional()
  @IsString()
  image: string;
}
