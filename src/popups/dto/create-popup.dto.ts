import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsDateString, IsString, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreatePopupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @ApiProperty({ minLength: 1, maxLength: 120 })
  title: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  body: string;

  @IsDateString({ strict: true })
  startsAt: string;

  @IsDateString({ strict: true })
  endsAt: string;
}
