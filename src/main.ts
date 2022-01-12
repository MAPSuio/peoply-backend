import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";

import * as passport from "passport";
import * as expressSession from "express-session";
import * as cookieParser from "cookie-parser";

async function bootstrap() {
  const PORT = process.env.PORT || 3000;
  const app = await NestFactory.create(AppModule);

  app.use(
    expressSession({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      secret: process.env.SESSION_SECRET!, // to sign session id
      resave: false, // will default to false in near future: https://github.com/expressjs/session#resave
      saveUninitialized: false, // will default to false in near future: https://github.com/expressjs/session#saveuninitialized
    }),
  );

  // { whitelist : true } this strips any atributes in a dto that has no decorator.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use(passport.session());

  app.enableCors({
    origin: ["http://localhost:3001", "https://peoply-frontend.vercel.app"],
    credentials: true,
  });

  await app.listen(PORT);
}
bootstrap();
