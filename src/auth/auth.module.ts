// src/auth/auth.module.ts
import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { OidcStrategy, buildOpenIdClient } from "./strategies/oidc.strategy";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { UsersModule } from "src/users/users.module";
import { UsersService } from "src/users/users.service";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./strategies/access.strategy";
import { RefreshStrategy } from "./strategies/refresh.strategy";

const OidcStrategyFactory = {
  provide: "OidcStrategy",
  import: [UsersModule, ConfigModule],
  useFactory: async (
    userService: UsersService,
    configService: ConfigService,
  ) => {
    const client = await buildOpenIdClient(configService); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
    const strategy = new OidcStrategy(client, userService, configService);
    return strategy;
  },
  inject: [UsersService, ConfigService],
};

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "oidc" }),
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_ACCESS_TOKEN_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_ACCESS_TOKEN_EXP_TIME"),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    OidcStrategyFactory,
    JwtStrategy,
    RefreshStrategy,
    AuthService,
    ConfigService,
    UsersService,
  ],
})
export class AuthModule {}
