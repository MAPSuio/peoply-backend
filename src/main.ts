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
import {
  isClientIpStamped,
  isOriginSecretConfigured,
  isZoneProven,
  resolveClientIp,
} from "./util/client-ip";
import { isTrustedProxy } from "./util/trusted-proxies";
import { oauthSessionOptions } from "./auth/oauth-session";
import { runWithRequest } from "./abuse-budget/principal-context";

async function bootstrap() {
  const PORT = process.env.PORT || 3000;
  const webcrypto = (crypto as typeof crypto & { webcrypto?: unknown })
    .webcrypto;

  if (webcrypto && !(globalThis as { crypto?: unknown }).crypto) {
    (globalThis as { crypto?: unknown }).crypto = webcrypto;
  }

  const app = await NestFactory.create(AppModule);

  /* The hop count in front of the container is not fixed (our Cloudflare zone,
     App Platform's own Cloudflare, then its internal router), so trust the hops
     by address range rather than by count. See util/trusted-proxies.ts. */
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", (address: string) => isTrustedProxy(address, false));

  /* Access log: method, path, status, duration, client IP. Placed before
     helmet so the entire request lifecycle is captured. */
  const httpLogger = new Logger("HTTP");
  const SKIP_PATHS = new Set(["/_health", "/readiness"]);

  if (!isOriginSecretConfigured()) {
    new Logger("Bootstrap").warn(
      "CLOUDFLARE_ORIGIN_SECRET is not set, so no request can prove it came " +
        "through our Cloudflare zone and the client address is read off the " +
        "forwarding chain alone. See docs/rate-limiting.md.",
    );
  }

  app.use((req: Request, _res: Response, next: NextFunction) => {
    runWithRequest(req, next);
  });

  let missingStampReported = false;

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (SKIP_PATHS.has(req.path)) return next();

    if (!missingStampReported && isZoneProven(req) && !isClientIpStamped(req)) {
      missingStampReported = true;
      new Logger("Bootstrap").warn(
        "Requests arrive from our Cloudflare zone without X-Peoply-Client-IP, " +
          "so the client address is read off the forwarding chain, which a " +
          "caller relaying through Cloudflare can steer. Add the header to the " +
          "transform rule — see docs/rate-limiting.md.",
      );
    }

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
