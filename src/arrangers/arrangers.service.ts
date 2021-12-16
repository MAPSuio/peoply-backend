import { ArrangerNotFoundException } from "./exceptions/arrangerNotFound.exception";
import { PrismaService } from "src/prisma.service";
import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";

@Injectable()
export class ArrangersService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll() {
    return await this.prismaService.arrangers.findMany();
  }

  async findOne(id: string) {
    const arranger = await this.prismaService.arrangers.findUnique({
      where: { arranger_id: id },
    });
    if (!arranger) {
      throw new ArrangerNotFoundException(id);
    }
    return arranger;
  }

  async remove(id: string) {
    try {
      return await this.prismaService.arrangers.delete({
        where: { arranger_id: id },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new ArrangerNotFoundException(id);
      } else {
        throw error;
      }
    }
  }
}
