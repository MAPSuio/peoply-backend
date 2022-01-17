import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UsersModule } from "./users/users.module";
import { EventsModule } from "./events/events.module";
import { RegistrationsModule } from "./registrations/registrations.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ArrangersModule } from "./arrangers/arrangers.module";
import { AuthModule } from "./auth/auth.module";
import * as Joi from "joi";

@Module({
  imports: [
    EventsModule,
    UsersModule,
    OrganizationsModule,
    ArrangersModule,
    RegistrationsModule,
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        JWT_ACCESS_TOKEN_EXP_TIME: Joi.number().required(),
        JWT_REFRESH_TOKEN_EXP_TIME: Joi.number().required(),
        JWT_ACCESS_TOKEN_SECRET: Joi.string().required(),
        JWT_REFRESH_TOKEN_SECRET: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        SESSION_SECRET: Joi.string().required(),
        VIPPS_OIDC_ISSUER: Joi.string().required(),
        VIPPS_OIDC_LOGIN_REDIRECT_URI: Joi.string().required(),
        VIPPS_OIDC_LOGIN_CLIENT_ID: Joi.string().required(),
        VIPPS_OIDC_LOGIN_CLIENT_SECRET: Joi.string().required(),
        VIPPS_OIDC_LOGIN_SCOPE: Joi.string().required(),
        VIPPS_OIDC_POST_LOGIN_REDIRECT_URI: Joi.string().required(),
      }),
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
