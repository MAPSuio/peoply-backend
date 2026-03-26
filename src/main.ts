import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import * as crypto from "crypto";

import * as passport from "passport";
import * as expressSession from "express-session";
import * as cookieParser from "cookie-parser";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const helmet = require("helmet");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectPgSimple = require("connect-pg-simple");
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { extractRequestOrigin, parseTrustedOrigins } from "./auth/auth-origin";

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

  // HTTP security headers
  app.use(helmet());

  const PgSession = connectPgSimple(expressSession);
  app.use(
    expressSession({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secret: process.env.SESSION_SECRET!, // to sign session id
      resave: false,
      saveUninitialized: false,
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: "session",
        createTableIfMissing: true,
      }),
    }),
  );

  // { whitelist : true } this strips any atributes in a dto that has no decorator.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const trustedOrigins = parseTrustedOrigins(process.env.CORS_ORIGIN);
    const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    const usesCookieAuth = Boolean(req.cookies?.access || req.cookies?.refresh);
    const requestOrigin = extractRequestOrigin(req.headers);

    if (
      isStateChanging &&
      usesCookieAuth &&
      requestOrigin &&
      trustedOrigins?.length &&
      !trustedOrigins.includes(requestOrigin)
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

  // Only expose API docs outside production
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Peoply API")
      .setDescription("The Peoply API description")
      .setVersion("1.0")
      .addTag("peoply")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api", app, document);
  }

  await app.listen(PORT);
}
bootstrap();
