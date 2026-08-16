import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { UploadSizeFilter } from "./azure/upload-size.filter";
import { PrismaExceptionFilter } from "./prisma/prisma-exception.filter";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import * as crypto from "node:crypto";

import passport = require("passport");
import expressSession = require("express-session");
import cookieParser = require("cookie-parser");
const helmet = require("helmet");
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { setupApiDocs } from "./api-docs/api-docs.setup";
import {
  extractRequestOrigin,
  isUntrustedOrigin,
  parseTrustedOrigins,
} from "./auth/auth-origin";
import { isOriginSecretConfigured, resolveClientIp } from "./util/client-ip";
import { oauthSessionOptions } from "./auth/oauth-session";

async function bootstrap() {
  const PORT = process.env.PORT || 3000;
  const webcrypto = (crypto as typeof crypto & { webcrypto?: unknown })
    .webcrypto;

  if (webcrypto && !(globalThis as { crypto?: unknown }).crypto) {
    (globalThis as { crypto?: unknown }).crypto = webcrypto;
  }

  const app = await NestFactory.create(AppModule);

  // Trust the first proxy hop (Cloudflare → DO App Platform) so req.ip
  // reflects the real client IP rather than the proxy address.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  /* Access log: method, path, status, duration, client IP. Placed before
     helmet so the entire request lifecycle is captured.

     Note what the IP is worth. Requests reach the origin through Cloudflare,
     and CF-Connecting-IP is not making it through, so what gets logged is a
     Cloudflare edge address shared by many visitors rather than any one of
     them. Useful for "is anything reaching us and what is it answering",
     which is what this log is for; not usable for attributing traffic to a
     client. */
  const httpLogger = new Logger("HTTP");
  const SKIP_PATHS = new Set(["/_health", "/readiness"]);

  // Without the shared secret there is no way to tell a request that came
  // through Cloudflare from one sent straight to the origin, so CF-Connecting-IP
  // has to be taken at face value and the per-IP rate limit can be sidestepped
  // by rotating it. Say so rather than letting it look protected.
  if (!isOriginSecretConfigured()) {
    new Logger("Bootstrap").warn(
      "CLOUDFLARE_ORIGIN_SECRET is not set — CF-Connecting-IP is trusted " +
        "unverified, so rate limiting can be bypassed by reaching the origin " +
        "directly. See docs/rate-limiting.md.",
    );
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (SKIP_PATHS.has(req.path)) return next();
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const ip = resolveClientIp(req);
      httpLogger.log(
        `${req.method} ${req.path} ${res.statusCode} ${ms}ms ${ip}`,
      );
    });
    next();
  });

  // HTTP security headers
  app.use(helmet());

  app.use(
    expressSession(
      oauthSessionOptions(
        process.env.SESSION_SECRET!, // to sign session id
        process.env.NODE_ENV === "production",
      ),
    ),
  );

  // { whitelist : true } this strips any atributes in a dto that has no decorator.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Maps Prisma error codes to HTTP responses so services do not each repeat
  // the same try/catch. Registered here rather than as an APP_FILTER provider
  // because it needs no request-scoped dependencies.
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost)),
    new UploadSizeFilter(),
  );
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const trustedOrigins = parseTrustedOrigins(process.env.CORS_ORIGIN);
    const usesCookieAuth = Boolean(req.cookies?.access || req.cookies?.refresh);

    if (
      isUntrustedOrigin(
        req.method,
        req.path,
        usesCookieAuth,
        extractRequestOrigin(req.headers),
        trustedOrigins,
      )
    ) {
      return res.status(403).send("Untrusted origin");
    }

    next();
  });
  app.use(passport.initialize());
  app.use(passport.session());

  app.enableCors({
    origin: parseTrustedOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle("Peoply API")
    .setDescription("The API behind peoply.app, a site for student events.")
    .setVersion("1.0")
    .build();

  // @nestjs/swagger still builds the OpenAPI document from the DTO decorators;
  // only the UI rendering it changed from Swagger UI to Scalar.
  setupApiDocs(app, SwaggerModule.createDocument(app, config));

  await app.listen(PORT);
}
bootstrap();
