import { IsNotEmpty, IsBoolean, IsString } from "class-validator";

export class CreateArrangerDto {
  @IsNotEmpty()
  @IsBoolean()
  is_business: boolean;

  @IsNotEmpty()
  @IsString()
  arranger_id: string;
}
