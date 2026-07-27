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
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UsersModule } from "../users/users.module";
import { UsersService } from "../users/services";
import { getTokenExpirySeconds } from "./token-expiry";
import {
  AccessStrategy,
  buildVippsClient,
  buildGoogleClient,
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
    const client = await buildVippsClient(configService); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
    const strategy = new VippsStrategy(client, userService, configService);
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
    const client = await buildGoogleClient(configService); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
    const strategy = new GoogleStrategy(client, userService, configService);
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
  }
}
