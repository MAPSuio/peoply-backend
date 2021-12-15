import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UsersModule } from "./users/users.module";
import { EventsModule } from "./events/events.module";

@Module({
  imports: [EventsModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
