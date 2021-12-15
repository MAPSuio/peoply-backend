import { IsDateString, IsEmail, IsString } from "class-validator";

export class CreateUserDto {
  @IsString()
  phone: string;

  @IsString()
  first_name: string;

  @IsString()
  last_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsDateString()
  birth_date: string;
}
