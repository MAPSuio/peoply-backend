// auth/auth.controller.ts
import {
  Controller,
  Get,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";

import { AuthService } from "./auth.service";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedGuard, VippsGuard, RefreshGuard } from "./guards";
import { RedirectOnUnauthorizedFilter } from "./filters/redirectOnUnauthorizedFilter.filter";
import { GoogleGuard } from "./guards/google.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @UseGuards(VippsGuard)
  @Get("/login")
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async login() {}

  @UseGuards(GoogleGuard)
  @Get("/login/google")
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async loginGoogle() {}

  @UseGuards(RefreshGuard)
  @Get("/refresh")
  async refresh(@Req() req: any, @Res() res: any) {
    /* create new access token cookie */
    const newAccessToken = this.authService.getAccessToken(req.user);
    const newRefreshToken = this.authService.getRefreshToken(req.user);
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    /* set headers related to token and cookie */
    res.cookie("refresh", newRefreshToken, refreshCookieOptions);
    res.cookie("access", newAccessToken, accessCookieOptions);

    /* headers telling the browser to save the cookies */
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Credentials", "true");

    return res.sendStatus(200);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/user")
  async user(@Req() req: any) {
    return { user: req.user };
  }

  @UseGuards(VippsGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/callback")
  async loginCallback(@Req() req: any, @Res() res: Response) {
    res.clearCookie("connect.sid"); // no need to send this

    /* create access and refresh tokens + cookie options */
    const accessToken = this.authService.getAccessToken(req.user);
    const refreshToken = this.authService.getRefreshToken(req.user);
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

    /* create access and refresh tokens + cookie options */
    const accessToken = this.authService.getAccessToken(req.user);
    const refreshToken = this.authService.getRefreshToken(req.user);
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

  @Get("/logout")
  async logout(@Req() req: any, @Res() res: Response) {
    /* cookie options should also be sent to make sure that cookie is cleared */
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    res.clearCookie("refresh", refreshCookieOptions);
    res.clearCookie("access", accessCookieOptions);
    return res.sendStatus(200);
  }
}
