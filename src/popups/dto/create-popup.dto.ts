import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsString, MaxLength, MinLength } from "class-validator";
import { Trim } from "../../../decorators/transformers";

export class CreatePopupDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @ApiProperty({ minLength: 1, maxLength: 120 })
  title: string;

  @Trim()
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
