// auth/auth.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";

import { AuthService } from "./auth.service";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedGuard, VippsGuard, RefreshGuard } from "./guards";
import { RedirectOnUnauthorizedFilter } from "./filters/redirectOnUnauthorizedFilter.filter";
import { GoogleGuard } from "./guards/google.guard";
import { UsersService } from "../users/services";
import { extractRequestOrigin } from "./auth-origin";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {}

  private isLocalAuthEnabled() {
    return (
      this.configService.get<boolean>("LOCAL_AUTH_ENABLED") === true &&
      process.env.NODE_ENV !== "production"
    );
  }

  private isLocalRequest(req: Request) {
    const host = req.hostname || req.headers.host?.split(":")[0];
    const origin = extractRequestOrigin(req.headers);
    const isLocalHost =
      host === "localhost" || host === "127.0.0.1" || host === "::1";

    if (!origin) {
      return isLocalHost;
    }

    try {
      const originHost = new URL(origin).hostname;
      return (
        isLocalHost &&
        (originHost === "localhost" ||
          originHost === "127.0.0.1" ||
          originHost === "::1")
      );
    } catch {
      return false;
    }
  }

  private assertLocalAuthRequest(req: Request) {
    if (!this.isLocalAuthEnabled() || !this.isLocalRequest(req)) {
      throw new NotFoundException();
    }
  }

  private resolveLocalAuthRedirect() {
    const frontendUrl = this.configService.get<string>("FRONTEND_URL");

    if (!frontendUrl) {
      return "http://localhost:3001";
    }

    try {
      const url = new URL(frontendUrl);
      if (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1"
      ) {
        return frontendUrl;
      }
    } catch {
      return "http://localhost:3001";
    }

    return "http://localhost:3001";
  }

  private async createLocalAuthSession(
    email: string | undefined,
    userId: string | undefined,
    res: Response,
  ) {
    if (!email && !userId) {
      throw new BadRequestException("email or userId is required");
    }

    const user = userId
      ? await this.usersService.findById(userId)
      : await this.usersService.findByEmail(email ?? "");

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const sessionUser = await this.usersService.ensureRefreshTokenId(user.id);
    const accessToken = this.authService.getAccessToken(sessionUser);
    const refreshToken = this.authService.getRefreshToken(sessionUser);
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    res.cookie("refresh", refreshToken, refreshCookieOptions);
    res.cookie("access", accessToken, accessCookieOptions);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Credentials", "true");

    return sessionUser;
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(VippsGuard)
  @Get("/login")
  async login() {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(GoogleGuard)
  @Get("/login/google")
  async loginGoogle() {}

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(RefreshGuard)
  @Post("/refresh")
  async refresh(@Req() req: any, @Res() res: any) {
    this.authService.assertTrustedOrigin(req.headers, {
      allowMissingOrigin: true,
    });

    const newAccessToken = this.authService.getAccessToken(req.user);
    const newRefreshToken = this.authService.getRefreshToken(req.user);
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    res.cookie("access", newAccessToken, accessCookieOptions);
    res.cookie("refresh", newRefreshToken, refreshCookieOptions);

    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Credentials", "true");

    return res.sendStatus(200);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/user")
  async user(@Req() req: any) {
    return { user: req.user };
  }

  @Get("/dev-users")
  async localAuthUsers(@Req() req: Request) {
    this.assertLocalAuthRequest(req);

    return {
      users: await this.usersService.findForLocalAuth(),
    };
  }

  @Get("/dev-login")
  async localAuthBrowserLogin(
    @Req() req: Request,
    @Query("email") email: string | undefined,
    @Query("userId") userId: string | undefined,
    @Res() res: Response,
  ) {
    this.assertLocalAuthRequest(req);

    await this.createLocalAuthSession(email, userId, res);

    return res.redirect(this.resolveLocalAuthRedirect());
  }

  @Post("/dev-login")
  async localAuthLogin(
    @Req() req: Request,
    @Body() body: { email?: string; userId?: string },
    @Res() res: Response,
  ) {
    this.assertLocalAuthRequest(req);

    const refreshedUser = await this.createLocalAuthSession(
      body.email,
      body.userId,
      res,
    );

    return res.status(200).send({ user: refreshedUser });
  }

  @Post("/dev-logout")
  async localAuthLogout(@Req() req: Request, @Res() res: Response) {
    this.assertLocalAuthRequest(req);

    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    res.clearCookie("refresh", refreshCookieOptions);
    res.clearCookie("access", accessCookieOptions);

    return res.sendStatus(200);
  }

  @UseGuards(VippsGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/callback")
  async loginCallback(@Req() req: any, @Res() res: Response) {
    res.clearCookie("connect.sid"); // no need to send this

    const user = await this.usersService.ensureRefreshTokenId(req.user.id);

    /* create access and refresh tokens + cookie options */
    const accessToken = this.authService.getAccessToken(user);
    const refreshToken = this.authService.getRefreshToken(user);
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    /* set headers related to token and cookie */
    res.cookie("refresh", refreshToken, refreshCookieOptions);
    res.cookie("access", accessToken, accessCookieOptions);

    /* headers telling the browser to save the cookies */
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Credentials", "true");

    const redirectURI = this.configService.get<string>(
      "VIPPS_OIDC_POST_LOGIN_REDIRECT_URI",
    );

    return res.redirect(redirectURI ? redirectURI : "");
  }

  @UseGuards(GoogleGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/callback/google")
  async loginGoogleCallback(@Req() req: any, @Res() res: Response) {
    res.clearCookie("connect.sid"); // no need to send this

    const user = await this.usersService.ensureRefreshTokenId(req.user.id);

    /* create access and refresh tokens + cookie options */
    const accessToken = this.authService.getAccessToken(user);
    const refreshToken = this.authService.getRefreshToken(user);
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    /* set headers related to token and cookie */
    res.cookie("refresh", refreshToken, refreshCookieOptions);
    res.cookie("access", accessToken, accessCookieOptions);

    /* headers telling the browser to save the cookies */
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Credentials", "true");

    const redirectURI = this.configService.get<string>(
      "GOOGLE_OIDC_POST_LOGIN_REDIRECT_URI",
    );

    return res.redirect(redirectURI ? redirectURI : "");
  }

  @UseGuards(AuthenticatedGuard)
  @Post("/logout")
  async logout(@Req() req: any, @Res() res: Response) {
    this.authService.assertTrustedOrigin(req.headers, {
      allowMissingOrigin: true,
    });
    await this.usersService.rotateRefreshTokenId(req.user.id);

    /* cookie options should also be sent to make sure that cookie is cleared */
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    res.clearCookie("refresh", refreshCookieOptions);
    res.clearCookie("access", accessCookieOptions);
    return res.sendStatus(200);
  }
}
