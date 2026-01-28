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
    const CORS_ORIGIN = "CORS_ORIGIN";

    const corsOrigin = this.configService.get(CORS_ORIGIN);
    if (!corsOrigin) {
      throw new Error(CORS_ORIGIN + " is not configured.");
    }
    return response.status(status).redirect(corsOrigin);
  }
}
