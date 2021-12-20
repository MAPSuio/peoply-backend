import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UsersModule } from "./users/users.module";
import { EventsModule } from "./events/events.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ArrangersModule } from "./arrangers/arrangers.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    EventsModule,
    UsersModule,
    OrganizationsModule,
    ArrangersModule,
    ConfigModule.forRoot(),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
