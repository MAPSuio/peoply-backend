import { IsUUID } from "class-validator";

export class DeleteRegistrationDto {
  @IsUUID()
  event_id: string;
}
