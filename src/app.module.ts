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
import { CategoriesModule } from "./categories/categories.module";
import * as Joi from "joi";
import { AzureModule } from "./azure/azure.module";

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
        CORS_ORIGIN: Joi.string().required(),
        AZURE_STORAGE_ACCOUNT: Joi.string().required(),
        AZURE_STORAGE_KEY: Joi.string().required(),
      }),
    }),
    AuthModule,
    AzureModule,
    CategoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
