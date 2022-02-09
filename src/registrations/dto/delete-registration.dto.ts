import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class DeleteRegistrationDto {
  @IsUUID(4)
  @ApiProperty()
  eventId: string;
}
