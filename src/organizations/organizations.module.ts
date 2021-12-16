import { Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { PrismaService } from "src/prisma.service";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PrismaService],
})
export class OrganizationsModule {}
