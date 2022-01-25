import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNumber, IsUUID } from "class-validator";

export class CategorizeEventDto {
  @IsArray()
  @IsNumber({}, { each: true }) // validates that each value in array is a number
  @ApiProperty({ type: [Number] })
  categories: number[];

  @IsUUID(4)
  @ApiProperty()
  event_id: string;
}
