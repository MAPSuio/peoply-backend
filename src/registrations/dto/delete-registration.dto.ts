import { IsUUID } from "class-validator";

export class DeleteRegistrationDto {
  @IsUUID(4)
  event_id: string;
}
