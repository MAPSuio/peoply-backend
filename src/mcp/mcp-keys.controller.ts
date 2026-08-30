import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedGuard } from "../auth/guards";
import { User } from "../generated/prisma/client";
import { CreateMcpApiKeyDto } from "./dto/create-mcp-api-key.dto";
import { McpApiKeyService } from "./mcp-api-key.service";

@ApiTags("MCP")
@Controller("mcp/keys")
@UseGuards(AuthenticatedGuard)
export class McpKeysController {
  constructor(private readonly apiKeys: McpApiKeyService) {}

  @Post()
  create(@Req() req: { user: User }, @Body() dto: CreateMcpApiKeyDto) {
    return this.apiKeys.create(req.user.id, dto);
  }

  @Get()
  list(@Req() req: { user: User }) {
    return this.apiKeys.list(req.user.id);
  }

  @Delete(":keyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Req() req: { user: User },
    @Param("keyId", new ParseUUIDPipe({ version: "4" })) keyId: string,
  ) {
    return this.apiKeys.revoke(req.user.id, keyId);
  }
}
