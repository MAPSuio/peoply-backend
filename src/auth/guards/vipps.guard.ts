// src/auth/login.guard.ts
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class VippsGuard extends AuthGuard("vipps") {}
