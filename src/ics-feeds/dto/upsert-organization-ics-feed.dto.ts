import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { EventRegistrationMode } from "../../generated/prisma/client";
import { IsEnum, IsInt, IsOptional, IsUrl, Max, Min } from "class-validator";

export class UpsertOrganizationIcsFeedDto {
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @ApiProperty()
  url: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  @Type(() => Number)
  @ApiProperty({ required: false, default: 60, minimum: 15, maximum: 1440 })
  syncIntervalMinutes?: number;

  @IsOptional()
  @IsEnum(EventRegistrationMode)
  @ApiProperty({
    required: false,
    enum: EventRegistrationMode,
    default: EventRegistrationMode.EXTERNAL,
  })
  registrationMode?: EventRegistrationMode;
}
