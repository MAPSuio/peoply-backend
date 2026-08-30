// src/auth/auth.module.ts
import {
  forwardRef,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { LegacyRefreshCookieMiddleware } from "./legacy-refresh-cookie.middleware";
import { SessionMarkerBackfillMiddleware } from "./session-marker-backfill.middleware";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UsersModule } from "../users/users.module";
import { UsersService } from "../users/services";
import { getTokenExpirySeconds } from "./token-expiry";
import {
  AccessStrategy,
  buildVippsConfig,
  buildGoogleConfig,
  VippsStrategy,
  GoogleStrategy,
  RefreshStrategy,
} from "./strategies";

const VippsStrategyFactory = {
  provide: "OidcStrategy",
  import: [UsersModule, ConfigModule],
  useFactory: async (
    userService: UsersService,
    configService: ConfigService,
  ) => {
    const config = await buildVippsConfig(configService); // secret sauce! discover the provider configuration before injecting it into the strategy for use in the constructor super call.
    const strategy = new VippsStrategy(config, userService, configService);
    return strategy;
  },
  inject: [UsersService, ConfigService],
};
const GoogleStrategyFactory = {
  provide: "GoogleStrategy",
  import: [UsersModule, ConfigModule],
  useFactory: async (
    userService: UsersService,
    configService: ConfigService,
  ) => {
    const config = await buildGoogleConfig(configService); // secret sauce! discover the provider configuration before injecting it into the strategy for use in the constructor super call.
    const strategy = new GoogleStrategy(config, userService, configService);
    return strategy;
  },
  inject: [UsersService, ConfigService],
};

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "oidc" }),
    forwardRef(() => UsersModule),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_ACCESS_TOKEN_SECRET"),
        signOptions: {
          expiresIn: getTokenExpirySeconds(
            configService,
            "JWT_ACCESS_TOKEN_EXP_TIME",
          ),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    VippsStrategyFactory,
    GoogleStrategyFactory,
    AuthService,
    AccessStrategy,
    RefreshStrategy,
    LegacyRefreshCookieMiddleware,
    SessionMarkerBackfillMiddleware,
  ],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LegacyRefreshCookieMiddleware)
      .forRoutes(
        { path: "auth/refresh", method: RequestMethod.POST },
        { path: "auth/callback", method: RequestMethod.GET },
        { path: "auth/callback/google", method: RequestMethod.GET },
      );

    consumer
      .apply(SessionMarkerBackfillMiddleware)
      .forRoutes({ path: "users/me", method: RequestMethod.GET });
  }
}
