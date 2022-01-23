import { IsArray, IsNumber, IsUUID } from "class-validator";

export class CategorizeEventDto {
  @IsArray()
  @IsNumber({}, { each: true }) // validates that each value in array is a number
  categories: number[];

  @IsUUID(4)
  event_id: string;
}
