// auth/auth.controller.ts
import {
  BadRequestException,
  Body,
  ConflictException,
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
import { Provider, User } from "../generated/prisma/client";

import { AuthService } from "./auth.service";
import { ConfigService } from "@nestjs/config";
import {
  AuthenticatedGuard,
  ClearLinkIntentGuard,
  LinkIntentGuard,
  VippsGuard,
  RefreshGuard,
} from "./guards";
import { RedirectOnUnauthorizedFilter } from "./filters/redirectOnUnauthorizedFilter.filter";
import { GoogleGuard } from "./guards/google.guard";
import { UsersService } from "../users/services";
import { extractRequestOrigin } from "./auth-origin";
import { CreateUserDto } from "../users/dto";
import { takeLinkUserId, takePendingLink } from "./link-session";
import { isLoopbackAddress } from "./local-auth";
import { OidcResolution } from "./strategies/oidc";
import { withoutRefreshTokenId } from "../users/user.response";
import {
  SESSION_MARKER_COOKIE_NAME,
  SESSION_MARKER_COOKIE_VALUE,
} from "./session-marker-cookie-name";

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
    res.cookie(
      SESSION_MARKER_COOKIE_NAME,
      SESSION_MARKER_COOKIE_VALUE,
      this.authService.getSessionMarkerCookieOptions(),
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
    res.clearCookie(
      SESSION_MARKER_COOKIE_NAME,
      this.authService.getSessionMarkerCookieOptions(),
    );
  }

  /**
   * Redirect back to the provider's configured frontend URL, with the
   * outcome of the callback as query params the frontend branches on:
   * `link_prompt`/`link_with` (show the confirm modal), `linked` (a link
   * succeeded) or `link_error`. Never any PII — providers only.
   */
  private redirectToFrontend(
    res: Response,
    redirectUriConfigKey: string,
    params: Record<string, string> = {},
  ) {
    const base = this.configService.get<string>(redirectUriConfigKey) ?? "";
    const query = new URLSearchParams(params).toString();

    return res.redirect(query ? `${base}?${query}` : base);
  }

  /**
   * The oauth session has served its purpose once a callback concludes — with
   * one exception: the pending-link branch, whose whole handshake is carried
   * by this very session, leaves it alive.
   */
  private destroyOauthSession(req: any, res: Response) {
    req.session?.destroy?.(() => {});
    res.clearCookie("connect.sid");
  }

  /**
   * The tail every completed OIDC login shares: the session cookies, and a
   * redirect back to whichever frontend URL that provider is configured with.
   */
  private async completeLogin(
    req: any,
    res: Response,
    userId: string,
    redirectUriConfigKey: string,
    params: Record<string, string> = {},
  ) {
    this.destroyOauthSession(req, res);

    const user = await this.usersService.ensureRefreshTokenId(userId);

    this.issueSessionCookies(res, user);

    return this.redirectToFrontend(res, redirectUriConfigKey, params);
  }

  /**
   * Whether the access cookie riding on this request belongs to `userId`.
   * The link intent was written by an authenticated request, but the callback
   * arrives a whole IdP round trip later — this is what proves the browser
   * still holds the same session, rather than someone else's intent.
   */
  private accessCookieMatches(req: any, userId: string) {
    const access = req.cookies?.access;

    if (!access) {
      return false;
    }

    try {
      return this.authService.validateJWT(access)?.sub === userId;
    } catch {
      return false;
    }
  }

  /**
   * linkProvider with its only expected failure folded into the redirect
   * outcome: the account already holding an identity from that provider is a
   * conflict the frontend explains, not an internal error. A failed link
   * never fails the login the person just proved.
   */
  private async tryLinkProvider(
    userId: string,
    provider: Provider,
    sub: string,
    profile?: CreateUserDto,
  ): Promise<Record<string, string>> {
    try {
      await this.usersService.linkProvider(userId, provider, sub, profile);
      return { linked: provider };
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      return { link_error: "in_use" };
    }
  }

  /**
   * What an OIDC callback's resolution becomes. Three modes, in order:
   *
   * 1. Link intent in the session (settings-initiated): attach the identity
   *    to the intent's user. No cookies are issued — that user is already
   *    logged in.
   * 2. The subject resolved to an existing user: a plain login, which also
   *    consumes a pending link when that user is the one it was waiting for.
   * 3. An unknown identity: create the user — unless its email belongs to an
   *    existing account, in which case nothing is created and nobody is
   *    logged in; the identity is parked in the session as a pending link and
   *    the frontend shows the "log in with your existing provider to link"
   *    modal. Owning an email at one provider is not proof of owning the
   *    account behind it at the other.
   */
  private async completeOidcCallback(
    req: any,
    res: Response,
    provider: Provider,
    redirectUriConfigKey: string,
  ) {
    const resolution: OidcResolution = req.user;
    const linkUserId = takeLinkUserId(req.session);

    if (linkUserId) {
      const outcome = await this.linkIntentOutcome(
        req,
        provider,
        resolution,
        linkUserId,
      );

      this.destroyOauthSession(req, res);
      return this.redirectToFrontend(res, redirectUriConfigKey, outcome);
    }

    if (resolution.status === "existing") {
      const params = await this.confirmPendingLink(
        req.session,
        resolution.user,
      );

      return this.completeLogin(
        req,
        res,
        resolution.user.id,
        redirectUriConfigKey,
        params,
      );
    }

    return this.loginNewIdentity(req, res, resolution, redirectUriConfigKey);
  }

  /** Mode 1: what a settings-initiated link intent resolves to. */
  private async linkIntentOutcome(
    req: any,
    provider: Provider,
    resolution: OidcResolution,
    linkUserId: string,
  ): Promise<Record<string, string>> {
    if (!this.accessCookieMatches(req, linkUserId)) {
      return { link_error: "expired" };
    }

    if (resolution.status === "existing") {
      return resolution.user.id === linkUserId
        ? { linked: provider }
        : { link_error: "in_use" };
    }

    return this.tryLinkProvider(
      linkUserId,
      resolution.provider,
      resolution.sub,
      resolution.profile,
    );
  }

  /** Mode 2's tail: a pending link the logging-in user may be the owner of. */
  private async confirmPendingLink(
    session: any,
    user: User,
  ): Promise<Record<string, string>> {
    const pending = takePendingLink(session);

    if (!pending) {
      return {};
    }

    if (pending.matchedUserId !== user.id) {
      return { link_error: "wrong_user" };
    }

    return this.tryLinkProvider(
      user.id,
      pending.provider,
      pending.sub,
      pending.profile,
    );
  }

  /** Mode 3: an identity nobody has seen before. */
  private async loginNewIdentity(
    req: any,
    res: Response,
    resolution: Extract<OidcResolution, { status: "new" }>,
    redirectUriConfigKey: string,
  ) {
    const { provider, sub, profile } = resolution;

    const emailOwner = await this.usersService.findByEmail(profile.email);
    if (emailOwner) {
      const linkedProviders = (
        await this.usersService.getLinkedProviders(emailOwner.id)
      ).map((linked) => linked.provider);

      /* Two dead ends where a pending link could never be satisfied: an
         account that already holds an identity from this provider (one per
         provider per user, so confirming can only end in in_use), and an
         account with no provider rows at all (dev seeds only) — nothing to
         confirm with. Parking the link would strand the person in the
         modal. */
      if (linkedProviders.includes(provider) || linkedProviders.length === 0) {
        this.destroyOauthSession(req, res);
        return this.redirectToFrontend(res, redirectUriConfigKey, {
          link_error: "email_in_use",
        });
      }

      const linkWith = linkedProviders.join(",");

      req.session.pendingLink = {
        provider,
        sub,
        profile,
        matchedUserId: emailOwner.id,
      };

      return this.redirectToFrontend(res, redirectUriConfigKey, {
        link_prompt: provider,
        link_with: linkWith,
      });
    }

    if (profile.phone && (await this.usersService.findByPhone(profile.phone))) {
      this.destroyOauthSession(req, res);
      return this.redirectToFrontend(res, redirectUriConfigKey, {
        link_error: "phone_in_use",
      });
    }

    const created = await this.usersService.create(profile, provider, sub);

    return this.completeLogin(req, res, created.id, redirectUriConfigKey);
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
  @UseGuards(ClearLinkIntentGuard, VippsGuard)
  @Get("/login")
  async login() {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClearLinkIntentGuard, GoogleGuard)
  @Get("/login/google")
  async loginGoogle() {}

  /* The link endpoints are the login endpoints with an intent: guard order is
     load-bearing. AuthenticatedGuard puts the user on the request,
     LinkIntentGuard writes the intent into the session, and the provider
     guard never returns — it ends in the redirect to the IdP. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthenticatedGuard, LinkIntentGuard, VippsGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/link")
  async linkVipps() {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthenticatedGuard, LinkIntentGuard, GoogleGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/link/google")
  async linkGoogle() {}

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
    return await this.completeOidcCallback(
      req,
      res,
      Provider.VIPPS,
      "VIPPS_OIDC_POST_LOGIN_REDIRECT_URI",
    );
  }

  @UseGuards(GoogleGuard)
  @UseFilters(RedirectOnUnauthorizedFilter)
  @Get("/callback/google")
  async loginGoogleCallback(@Req() req: any, @Res() res: Response) {
    return await this.completeOidcCallback(
      req,
      res,
      Provider.GOOGLE,
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
