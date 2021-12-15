import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
  const PORT = process.env.PORT || 3000;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // { whitelist : true } this strips any atributes in a dto that has no decorator.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(PORT, "0.0.0.0");
}
bootstrap();
