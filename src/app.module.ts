import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UsersModule } from "./users/users.module";
import { EventsModule } from "./events/events.module";
import { RegistrationsModule } from "./registrations/registrations.module";

@Module({
  imports: [EventsModule, UsersModule, RegistrationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
