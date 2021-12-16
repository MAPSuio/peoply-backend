import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateOrganizationDto {
  arranger_id: string;

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
