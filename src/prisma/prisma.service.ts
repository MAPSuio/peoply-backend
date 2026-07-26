import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * This used to carry an `enableShutdownHooks(app)` that registered
 * `this.$on("beforeExit", () => app.close())`. Prisma 5 removed the
 * `beforeExit` event for the library engine — the client installs its own
 * exit hooks and disconnects on process exit — so the method stopped
 * compiling.
 *
 * It was also dead code: nothing called it, and `main.ts` never calls
 * `app.enableShutdownHooks()` either, so Nest's shutdown lifecycle has never
 * run in this application. Wiring that up properly (shutdown hooks, draining
 * in-flight requests, flipping readiness before the port closes) is a change
 * of its own rather than a side effect of a dependency bump, so it is left
 * out here instead of being reintroduced in a shape that still never fires.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
