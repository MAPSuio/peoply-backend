// src/auth/login.guard.ts
import { Injectable, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class VippsGuard extends AuthGuard("vipps") {
  private readonly logger = new Logger(VippsGuard.name);

  handleRequest(err: any, user: any, info: any, context: any, status?: any) {
    if (err || !user) {
      this.logger.warn(
        `Vipps login failed: err=${err?.name ?? ""} ${err?.message ?? ""} | info=${info?.name ?? ""} ${info?.message ?? info ?? ""}`,
      );
    }
    return super.handleRequest(err, user, info, context, status);
  }
}
