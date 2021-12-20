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
    /* create new access token */
    const newAccessToken = this.authService.getAccessToken(req.user);
    res.send(newAccessToken);
  }

  @UseGuards(AccessGuard)
  @Get("/user")
  user(@Req() req: any) {
    return req.user;
  }

  @UseGuards(LoginGuard)
  @Get("/callback")
  async loginCallback(@Req() req: any, @Res() res: Response) {
    /* create access and refresh tokens */
    const accessToken = this.authService.getAccessToken(req.user);
    const refreshCookie = this.authService.getRefreshTokenCookie(req.user);

    /* set headers related to token and cookie */
    res.set("Set-Cookie", refreshCookie);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Expose-Headers", "Set-Cookie");
    res.set("Credentials", "true");
    res.set("x-token", accessToken);

    // TODO: redirect to user origin
    return res.redirect("/");
  }

  @Get("/logout")
  async logout(@Req() req: any, @Res() res: Response) {
    res.clearCookie("Refresh");
    return res.sendStatus(200);
  }
}
