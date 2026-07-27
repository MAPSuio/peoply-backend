import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
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
import { PrismaModule } from "./prisma/prisma.module";
import { FavoritesModule } from "./favorites/favorites.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { ModerationModule } from "./moderation/moderation.module";
import { AllergensModule } from "./allergens/allergens.module";
import { IcsFeedsModule } from "./ics-feeds/ics-feeds.module";
import { CfThrottlerGuard } from "./cf-throttler.guard";
import { ThreatDetectionModule } from "./threat-detection/threat-detection.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { HealthModule } from "./health/health.module";
import { RecommendationsModule } from "./recommendations/recommendations.module";
import { LocationSearchModule } from "./location-search/location-search.module";

@Module({
  imports: [
    EventsModule,
    UsersModule,
    ModerationModule,
    OrganizationsModule,
    ArrangersModule,
    RegistrationsModule,
    ScheduleModule.forRoot(),
    // Global rate limit: 100 requests per IP per minute
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60000,
        limit: 100,
      },
    ]),
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        JWT_ACCESS_TOKEN_EXP_TIME: Joi.number().required(),
        JWT_REFRESH_TOKEN_EXP_TIME: Joi.number().required(),
        JWT_ACCESS_TOKEN_SECRET: Joi.string().required(),
        JWT_REFRESH_TOKEN_SECRET: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        // Optional: only managed databases with a private CA need it. Unset
        // locally and in CI, where Postgres runs without TLS.
        DATABASE_CA_CERT: Joi.string().optional(),
        SESSION_SECRET: Joi.string().required(),
        VIPPS_OIDC_ISSUER: Joi.string().required(),
        VIPPS_OIDC_LOGIN_REDIRECT_URI: Joi.string().required(),
        VIPPS_OIDC_LOGIN_CLIENT_ID: Joi.string().required(),
        VIPPS_OIDC_LOGIN_CLIENT_SECRET: Joi.string().required(),
        VIPPS_OIDC_LOGIN_SCOPE: Joi.string().required(),
        VIPPS_OIDC_POST_LOGIN_REDIRECT_URI: Joi.string().required(),
        GOOGLE_OIDC_ISSUER: Joi.string().required(),
        GOOGLE_OIDC_LOGIN_REDIRECT_URI: Joi.string().required(),
        GOOGLE_OIDC_LOGIN_CLIENT_ID: Joi.string().required(),
        GOOGLE_OIDC_LOGIN_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_OIDC_LOGIN_SCOPE: Joi.string().required(),
        GOOGLE_OIDC_POST_LOGIN_REDIRECT_URI: Joi.string().required(),
        LOCAL_AUTH_ENABLED: Joi.boolean().default(false),
        CORS_ORIGIN: Joi.string().required(),
        AZURE_STORAGE_ACCOUNT: Joi.string().required(),
        AZURE_STORAGE_KEY: Joi.string().required(),
        AZURE_STORAGE_SKIP_INIT: Joi.boolean().optional(),
        AZURE_COMMUNICATION_CONNECTION_STRING: Joi.string().optional(),
        LOCATION_SEARCH_PROVIDER: Joi.string()
          .valid("entur", "geonorge")
          .default("entur"),
        ENTUR_GEOCODER_CLIENT_NAME: Joi.string().optional(),
        DISCORD_ALERT_WEBHOOK_URL: Joi.string().uri().optional(),
        THREAT_DETECTION_ENABLED: Joi.boolean().default(true),
        THREAT_ALERT_COOLDOWN_MS: Joi.number().default(300000),
      }),
    }),
    AuthModule,
    HealthModule,
    ThreatDetectionModule,
    AzureModule,
    CategoriesModule,
    PrismaModule,
    LocationSearchModule,
    FeedbackModule,
    FavoritesModule,
    NotificationsModule,
    InvitationsModule,
    AllergensModule,
    IcsFeedsModule,
    RecommendationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally, using CF-Connecting-IP when available
    {
      provide: APP_GUARD,
      useClass: CfThrottlerGuard,
    },
  ],
})
export class AppModule {}
