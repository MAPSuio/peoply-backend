// auth/auth.controller.ts
import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";

import { LoginGuard } from "./guards/login.guard";
import { AuthService } from "./auth.service";
import { AccessGuard } from "./guards/access.guard";
import RefreshGuard from "./guards/refresh.guard";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LoginGuard)
  @Get("/login")
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async login() {}

  @UseGuards(RefreshGuard)
  @Get("/refresh")
  refresh(@Req() req: any, @Res() res: any) {
    /* create new access token cookie */
    const newAccessToken = this.authService.getAccessToken(req.user);
    const accessCookieOptions = this.authService.getAccessCookieOptions();

    return res
      .cookie("access", newAccessToken, accessCookieOptions)
      .sendStatus(200);
  }

  @UseGuards(AccessGuard)
  @Get("/user")
  user(@Req() req: any) {
    return req.user;
  }

  @UseGuards(LoginGuard)
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

    // TODO: redirect to user origin
    return res.redirect("http://localhost:3001");
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
