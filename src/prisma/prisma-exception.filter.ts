import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaError } from "./prisma.constants";

/**
 * Turns Prisma's error codes into HTTP responses in one place.
 *
 * Before this filter, every service and controller wrapped its own queries in
 * a try/catch that tested `error.code` and rethrew a domain exception. That
 * was ~24 near-identical blocks, and each one only covered the codes its
 * author happened to think of — anything else surfaced as a bare 500.
 *
 * Two rules hold here:
 *
 * 1. Nothing from `error.message` reaches the client. Prisma puts query
 *    fragments and column values in it, so it is logged, never returned.
 * 2. Only the meta fields listed below are used to build a message. They name
 *    models and columns, which the API already exposes through its DTOs.
 */
@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const { status, message } = this.translate(exception);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      // An unmapped code. Log the whole thing — this is the only record of
      // what actually went wrong, since the client gets nothing.
      this.logger.error(
        `Unhandled Prisma error ${exception.code}: ${exception.message}`,
      );
    } else {
      this.logger.warn(
        `Prisma ${exception.code} -> ${status} on ${httpAdapter.getRequestMethod(
          ctx.getRequest(),
        )} ${httpAdapter.getRequestUrl(ctx.getRequest())}`,
      );
    }

    httpAdapter.reply(
      ctx.getResponse(),
      {
        statusCode: status,
        message,
        error: this.reasonPhrase(status),
      },
      status,
    );
  }

  private translate(exception: PrismaClientKnownRequestError): {
    status: HttpStatus;
    message: string;
  } {
    switch (exception.code) {
      case PrismaError.DuplicateUniqueValue:
        return {
          status: HttpStatus.CONFLICT,
          message: this.duplicateMessage(exception),
        };

      // Prisma raises this whenever an update or delete cannot find its row,
      // which is the overwhelmingly common not-found case.
      case PrismaError.EntityNotFound:
      case PrismaError.DoesNotExist:
        return {
          status: HttpStatus.NOT_FOUND,
          message: this.notFoundMessage(exception),
        };

      case PrismaError.ForeignKeyFailed:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: this.foreignKeyMessage(exception),
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Internal server error",
        };
    }
  }

  private duplicateMessage(exception: PrismaClientKnownRequestError): string {
    const fields = this.fieldList(exception.meta?.target);
    return fields
      ? `A record with this ${fields} already exists`
      : "A record with these values already exists";
  }

  private notFoundMessage(exception: PrismaClientKnownRequestError): string {
    const model = exception.meta?.modelName;
    return typeof model === "string" && model
      ? `${model} not found`
      : "The requested record was not found";
  }

  private foreignKeyMessage(exception: PrismaClientKnownRequestError): string {
    const fields = this.fieldList(exception.meta?.field_name);
    return fields
      ? `Invalid reference in ${fields}`
      : "A referenced record does not exist";
  }

  /**
   * Prisma reports the offending columns as either a string or an array
   * depending on the code and the connector, so both are normalised here.
   * Anything else is dropped rather than stringified into the response.
   */
  private fieldList(meta: unknown): string | null {
    if (typeof meta === "string" && meta) {
      return meta;
    }
    if (Array.isArray(meta) && meta.every((f) => typeof f === "string")) {
      return meta.length > 0 ? meta.join(", ") : null;
    }
    return null;
  }

  private reasonPhrase(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.CONFLICT:
        return "Conflict";
      case HttpStatus.NOT_FOUND:
        return "Not Found";
      case HttpStatus.BAD_REQUEST:
        return "Bad Request";
      default:
        return "Internal Server Error";
    }
  }
}
