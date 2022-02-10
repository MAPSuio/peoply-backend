import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class EventArrangersService {
  constructor(private readonly prismaService: PrismaService) {}

  //find all events arranged by a given arrangerID
  async findAllWithEvents(arrangerId: string) {
    return await this.prismaService.eventArranger.findMany({
      where: { arrangerId },
      include: {
        event: true,
      },
    });
  }
}
