import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { UsersModule } from "./users/users.module";
import { EventsModule } from "./events/events.module";
import { RegistrationsModule } from "./registrations/registrations.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ArrangersModule } from "./arrangers/arrangers.module";
import { AuthModule } from "./auth/auth.module";
import { jwtSecretSchema } from "./auth/jwt-secret.schema";
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
import { DiscordModule } from "./discord/discord.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { HealthModule } from "./health/health.module";
import { RecommendationsModule } from "./recommendations/recommendations.module";
import { LocationSearchModule } from "./location-search/location-search.module";
import { PopupsModule } from "./popups/popups.module";
import { McpModule } from "./mcp/mcp.module";

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
        ...jwtSecretSchema,
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
        // Domain the session marker cookie is written for, so the frontend on
        // peoply.app can read a cookie the api on api.peoply.app set. Unset
        // means host-only, which is what local development needs.
        SESSION_COOKIE_DOMAIN: Joi.string().allow("").optional(),
        AZURE_STORAGE_ACCOUNT: Joi.string().required(),
        AZURE_STORAGE_KEY: Joi.string().required(),
        AZURE_STORAGE_SKIP_INIT: Joi.boolean().optional(),
        AZURE_COMMUNICATION_CONNECTION_STRING: Joi.string().optional(),
        LOCATION_SEARCH_PROVIDER: Joi.string()
          .valid("entur", "geonorge")
          .default("entur"),
        ENTUR_GEOCODER_CLIENT_NAME: Joi.when("LOCATION_SEARCH_PROVIDER", {
          is: "entur",
          // biome-ignore lint/suspicious/noThenProperty: Joi.when uses "then" as API key.
          then: Joi.string().required(),
          otherwise: Joi.string().optional(),
        }),
        DISCORD_ALERT_WEBHOOK_URL: Joi.string().uri().optional(),
        // Shared with a Cloudflare transform rule so the origin can tell
        // traffic that came through Cloudflare from traffic sent straight to
        // its *.ondigitalocean.app hostname. Without it CF-Connecting-IP has
        // to be taken on trust. See docs/rate-limiting.md.
        CLOUDFLARE_ORIGIN_SECRET: Joi.string().min(16).optional(),
        // Comma-separated emails allowed through ModeratorGuard. Unset means
        // every /moderation endpoint answers 403 — the /stats page in the
        // frontend is dead until this is configured.
        MODERATOR_EMAILS: Joi.string().optional(),
      }),
    }),
    AuthModule,
    HealthModule,
    DiscordModule,
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
    PopupsModule,
    McpModule,
  ],
  providers: [
    // Apply rate limiting globally, using CF-Connecting-IP when available
    {
      provide: APP_GUARD,
      useClass: CfThrottlerGuard,
    },
  ],
})
export class AppModule {}
