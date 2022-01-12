import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString } from "class-validator";

export class SearchEventDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  event_id?: number;

  // @IsOptional()
  // @IsDateString()
  // start_date?: Date;

  // @IsOptional()
  // @IsDateString()
  // end_date?: Date;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  capacity?: number;

  // @IsOptional()
  // @IsBoolean()
  // @Type(() => Boolean)
  // private?: boolean;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  organization_id?: string;

  @IsOptional()
  @IsString()
  arranger_id?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  take?: number;
}
