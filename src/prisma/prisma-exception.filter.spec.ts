import { ArgumentsHost, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

describe("PrismaExceptionFilter", () => {
  let filter: PrismaExceptionFilter;
  let reply: jest.Mock;

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: "POST", url: "/events" }),
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  /** Builds the error shape Prisma raises, including its `meta` payload. */
  const prismaError = (code: string, meta?: Record<string, unknown>) => {
    const error = new Prisma.PrismaClientKnownRequestError(
      // Prisma puts query fragments and column values in here. Every
      // assertion below depends on this string never reaching the client.
      `Invalid \`prisma.event.update()\` invocation: secret-query-detail`,
      { code, clientVersion: Prisma.prismaVersion.client, meta },
    );
    return error;
  };

  const run = (code: string, meta?: Record<string, unknown>) => {
    filter.catch(prismaError(code, meta), host);
    // Read the latest call, so a test may invoke `run` more than once.
    const call = reply.mock.calls[reply.mock.calls.length - 1];
    return { body: call[1], status: call[2] };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    reply = jest.fn();
    filter = new PrismaExceptionFilter({
      httpAdapter: {
        reply,
        getRequestMethod: (req: any) => req.method,
        getRequestUrl: (req: any) => req.url,
      },
    } as any);
  });

  describe("status mapping", () => {
    it("maps a unique constraint violation to 409", () => {
      expect(run("P2002").status).toBe(HttpStatus.CONFLICT);
    });

    it("maps a missing record to 404", () => {
      expect(run("P2025").status).toBe(HttpStatus.NOT_FOUND);
    });

    it("maps a failed foreign key to 400", () => {
      expect(run("P2003").status).toBe(HttpStatus.BAD_REQUEST);
    });

    it("maps an unrecognised code to 500 without describing it", () => {
      const { status, body } = run("P2037");

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe("Internal server error");
    });
  });

  // The pre-filter code raised `HttpException(error + "...", 500)` in at least
  // one place, which put the raw Prisma text straight into the response body.
  describe("does not leak query details", () => {
    it.each(["P2002", "P2025", "P2003", "P2037"])(
      "keeps the raw Prisma message out of the %s response",
      (code) => {
        const { body } = run(code, { target: ["email"] });

        expect(JSON.stringify(body)).not.toContain("secret-query-detail");
        expect(JSON.stringify(body)).not.toContain("prisma.event.update");
      },
    );

    it("logs the full message for unmapped codes so it is not simply lost", () => {
      const error = jest.spyOn(Logger.prototype, "error");

      run("P2037");

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("secret-query-detail"),
      );
    });
  });

  describe("messages built from meta", () => {
    it("names the duplicated field when Prisma reports one", () => {
      expect(run("P2002", { target: ["email"] }).body.message).toBe(
        "A record with this email already exists",
      );
    });

    it("joins multiple duplicated fields", () => {
      expect(run("P2002", { target: ["eventId", "userId"] }).body.message).toBe(
        "A record with this eventId, userId already exists",
      );
    });

    it("accepts a bare string target, which some connectors return", () => {
      expect(run("P2002", { target: "urlId" }).body.message).toBe(
        "A record with this urlId already exists",
      );
    });

    it("names the model on a not-found", () => {
      expect(run("P2025", { modelName: "Event" }).body.message).toBe(
        "Event not found",
      );
    });

    it("falls back to a generic message when meta is absent", () => {
      expect(run("P2025").body.message).toBe(
        "The requested record was not found",
      );
      expect(run("P2003").body.message).toBe(
        "A referenced record does not exist",
      );
    });

    it("ignores meta that is neither a string nor a string array", () => {
      // Guards against an object being stringified into the response as
      // "[object Object]" — or worse, carrying values with it.
      expect(
        run("P2002", { target: { columns: ["email"] } }).body.message,
      ).toBe("A record with these values already exists");
    });
  });

  it("reports the status text alongside the code", () => {
    const { body } = run("P2025");

    expect(body).toEqual({
      statusCode: HttpStatus.NOT_FOUND,
      message: "The requested record was not found",
      error: "Not Found",
    });
  });
});
