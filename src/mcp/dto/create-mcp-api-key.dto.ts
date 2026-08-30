import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { McpApiKeyScope } from "../../generated/prisma/client";
import { MCP_DEFAULT_EXPIRY_DAYS, MCP_MAX_EXPIRY_DAYS } from "../mcp.constants";

export class CreateMcpApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ example: "Claude Code on my laptop" })
  name: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(McpApiKeyScope, { each: true })
  @ApiProperty({ enum: McpApiKeyScope, isArray: true, required: false })
  scopes: McpApiKeyScope[] = [McpApiKeyScope.READ];

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MCP_MAX_EXPIRY_DAYS)
  @Type(() => Number)
  @ApiProperty({ default: MCP_DEFAULT_EXPIRY_DAYS, required: false })
  expiresInDays: number = MCP_DEFAULT_EXPIRY_DAYS;
}
