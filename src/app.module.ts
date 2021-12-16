import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UsersModule } from "./users/users.module";
import { EventsModule } from "./events/events.module";
import { ArrangersModule } from './arrangers/arrangers.module';

@Module({
  imports: [EventsModule, UsersModule, ArrangersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
