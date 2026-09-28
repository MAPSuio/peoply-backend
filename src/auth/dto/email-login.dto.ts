import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength } from "class-validator";

export class RequestEmailLoginDto {
  @ApiProperty({ example: "person@example.com" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class VerifyEmailLoginDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  token: string;
}
