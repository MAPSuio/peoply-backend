import { All, Controller, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { McpHandlerService } from "./mcp-handler.service";

@ApiExcludeController()
@Controller("mcp")
export class McpController {
  constructor(private readonly handler: McpHandlerService) {}

  @All()
  @SkipThrottle()
  handle(@Req() req: Request, @Res() res: Response) {
    return this.handler.handle(req, res);
  }
}
