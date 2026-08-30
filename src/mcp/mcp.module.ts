import { Module } from "@nestjs/common";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { EventAccessModule } from "../event-access/event-access.module";
import { EventsModule } from "../events/events.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RegistrationsModule } from "../registrations/registrations.module";
import { UsersModule } from "../users/users.module";
import { McpApiKeyService } from "./mcp-api-key.service";
import { McpHandlerService } from "./mcp-handler.service";
import { McpKeysController } from "./mcp-keys.controller";
import { McpRateLimitService } from "./mcp-rate-limit.service";
import { McpServerFactory } from "./mcp-server.factory";
import { McpController } from "./mcp.controller";

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    EventAccessModule,
    OrganizationsModule,
    RegistrationsModule,
    FavoritesModule,
    UsersModule,
    ArrangersModule,
    NotificationsModule,
  ],
  controllers: [McpKeysController, McpController],
  providers: [
    McpApiKeyService,
    McpRateLimitService,
    McpServerFactory,
    McpHandlerService,
  ],
  exports: [McpApiKeyService],
})
export class McpModule {}
