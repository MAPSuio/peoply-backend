import { PrismaService } from "../../prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { ArrangerNotFoundException } from "../exceptions";

@Injectable()
export class ArrangersService {
  constructor(private readonly prismaService: PrismaService) {}

  async findOne(id: string) {
    const arranger = await this.prismaService.arranger.findUnique({
      where: { id: id },
    });
    if (!arranger) {
      throw new ArrangerNotFoundException(id);
    }
    return arranger;
  }
}
