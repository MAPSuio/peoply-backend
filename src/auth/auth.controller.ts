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
import { User } from "../generated/prisma/client";

import { AuthService } from "./auth.service";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedGuard, VippsGuard, RefreshGuard } from "./guards";
import { RedirectOnUnauthorizedFilter } from "./filters/redirectOnUnauthorizedFilter.filter";
import { GoogleGuard } from "./guards/google.guard";
import { UsersService } from "../users/services";
import { extractRequestOrigin } from "./auth-origin";
import { isLoopbackAddress } from "./local-auth";
import { withoutRefreshTokenId } from "../users/user.response";

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
    // The peer address is the one thing here the caller cannot choose: Host,
    // X-Forwarded-Host and Origin are all just headers. Checked first so that
    // no combination of headers can reach the rest of this.
    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      return false;
    }

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

  /**
   * Mints an access and a refresh token for `user` and puts them on the
   * response as the pair of cookies the frontend authenticates with.
   *
   * Every login path ends here — the two OIDC callbacks, the refresh endpoint
   * and the local dev login — so the cookie names, their options and the two
   * headers that tell the browser to keep them are stated once. They were
   * written out four times, which is four places to miss when a cookie flag
   * changes.
   */
  private issueSessionCookies(res: Response, user: User) {
    res.cookie(
      "refresh",
      this.authService.getRefreshToken(user),
      this.authService.getRefreshCookieOptions(),
    );
    res.cookie(
      "access",
      this.authService.getAccessToken(user),
      this.authService.getAccessCookieOptions(),
    );

    /* headers telling the browser to save the cookies */
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Credentials", "true");
  }

  /**
   * Clearing a cookie only works when the options match the ones it was
   * written with, so this has to stay the mirror image of
   * {@link issueSessionCookies}.
   */
  private clearSessionCookies(res: Response) {
    res.clearCookie("refresh", this.authService.getRefreshCookieOptions());
    res.clearCookie("access", this.authService.getAccessCookieOptions());
  }

  /**
   * The tail every OIDC provider's callback shares: the session cookies, and a
   * redirect back to whichever frontend URL that provider is configured with.
   */
  private async completeOidcLogin(
    req: any,
    res: Response,
    redirectUriConfigKey: string,
  ) {
    res.clearCookie("connect.sid"); // no need to send this

    const user = await this.usersService.ensureRefreshTokenId(req.user.id);

    this.issueSessionCookies(res, user);

    const redirectURI = this.configService.get<string>(redirectUriConfigKey);

    return res.redirect(redirectURI ? redirectURI : "");
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

    this.issueSessionCookies(res, sessionUser);

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

    this.issueSessionCookies(res, req.user);

    return res.sendStatus(200);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/user")
  async user(@Req() req: any) {
    return { user: withoutRefreshTokenId(req.user) };
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

    this.clearSessionCookies(res);

    return res.sendStatus(200);
  }

  @UseGuards(VippsGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/callback")
  async loginCallback(@Req() req: any, @Res() res: Response) {
    return await this.completeOidcLogin(
      req,
      res,
      "VIPPS_OIDC_POST_LOGIN_REDIRECT_URI",
    );
  }

  @UseGuards(GoogleGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/callback/google")
  async loginGoogleCallback(@Req() req: any, @Res() res: Response) {
    return await this.completeOidcLogin(
      req,
      res,
      "GOOGLE_OIDC_POST_LOGIN_REDIRECT_URI",
    );
  }

  @UseGuards(AuthenticatedGuard)
  @Post("/logout")
  async logout(@Req() req: any, @Res() res: Response) {
    this.authService.assertTrustedOrigin(req.headers, {
      allowMissingOrigin: true,
    });
    await this.usersService.rotateRefreshTokenId(req.user.id);

    this.clearSessionCookies(res);

    return res.sendStatus(200);
  }
}
