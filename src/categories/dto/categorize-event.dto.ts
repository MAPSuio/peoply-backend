import { IsArray, IsUUID } from "class-validator";

export class CategorizeEventDto {
  @IsArray()
  categories: number[];

  @IsUUID()
  event_id: string;
}
