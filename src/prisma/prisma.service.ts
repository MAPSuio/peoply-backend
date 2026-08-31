import { Injectable } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma/client";
import { createPrismaAdapter } from "./prisma.adapter";

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({ adapter: createPrismaAdapter() });
  }
}
