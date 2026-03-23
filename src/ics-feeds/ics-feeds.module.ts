import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { AzureModule } from "../azure/azure.module";
import { IcsFeedsController } from "./ics-feeds.controller";
import { IcsFeedsService } from "./ics-feeds.service";
import { IcsFetchService } from "./ics-fetch.service";
import { IcsParserService } from "./ics-parser.service";

@Module({
  imports: [
    PrismaModule,
    OrganizationsModule,
    AuthModule,
    UsersModule,
    AzureModule,
  ],
  controllers: [IcsFeedsController],
  providers: [IcsFeedsService, IcsFetchService, IcsParserService],
  exports: [IcsFeedsService],
})
export class IcsFeedsModule {}
