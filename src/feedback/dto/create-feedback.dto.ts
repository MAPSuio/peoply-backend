import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Trim } from "../../../decorators/transformers";

export class CreateFeedbackDto {
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  message: string;
}
