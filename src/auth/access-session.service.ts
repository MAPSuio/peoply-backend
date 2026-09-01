import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { User } from "../generated/prisma/client";
import { UsersService } from "../users/services";

export type AccessTokenPayload = {
  sub?: string;
  sid?: string;
  tokenId?: unknown;
};

export type RequestWithCookies = {
  cookies?: Record<string, string | undefined>;
};

@Injectable()
export class AccessSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async userFromRequest(request: RequestWithCookies): Promise<User> {
    const token = request.cookies?.access;

    if (!token) {
      throw new UnauthorizedException();
    }

    return this.userFromPayload(this.verify(token));
  }

  async userFromPayload(payload: AccessTokenPayload): Promise<User> {
    if (payload.tokenId !== undefined || !payload.sub || !payload.sid) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.refreshTokenId || user.refreshTokenId !== payload.sid) {
      throw new UnauthorizedException();
    }

    return user;
  }

  private verify(token: string): AccessTokenPayload {
    try {
      return this.jwtService.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
  }
}
