import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";

@Catch(UnauthorizedException)
export class RedirectOnUnauthorizedFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    return response
      .status(status)
      .redirect(this.configService.get("CORS_ORIGIN")!);
  }
}
