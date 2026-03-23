import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUrl, Max, Min } from "class-validator";

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
}
