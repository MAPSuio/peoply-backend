import { IsUUID } from "class-validator";

export class UuidDto {
  @IsUUID(4)
  id: string;
}
