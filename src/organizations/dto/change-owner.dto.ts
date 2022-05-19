import { IsNotEmpty, IsUUID } from "class-validator";

export class ChangeOwnerDto {
  @IsNotEmpty()
  @IsUUID(4)
  newOwnerId: string;
}
