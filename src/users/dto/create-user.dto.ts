import {
  IsDateString,
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
} from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
