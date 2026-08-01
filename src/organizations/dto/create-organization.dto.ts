import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateOrganizationDto {
  /* Reaches the Discord embed that alerts moderators about a reported
     organization. Discord rejects a field value over 1024 characters with a
     400, which reportOrganization only logs - so an unbounded name let an
     organization make itself permanently unreportable. */
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  @ApiProperty()
  name: string;

  /* `image` is deliberately absent. It is the blob name the organization's
     logo is stored under, and `update` deletes `org.image` from the shared
     organization-images container without checking who owns that blob - so a
     writable `image` let any authenticated user point their own organization
     at another organization's logo and then delete it by asking to remove
     their own. It is set server-side from the uploaded `orgImage` file, and
     the frontend has only ever sent that. */

  @IsOptional()
  @IsString()
  @ApiProperty()
  @MaxLength(300)
  description?: string;
}
