import { PrismaService } from "../../prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaError } from "../../prisma/prisma.constants";
import { ArrangerNotFoundException } from "../exceptions";

@Injectable()
export class ArrangersService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll() {
    return await this.prismaService.arranger.findMany();
  }

  async findOne(id: string) {
    const arranger = await this.prismaService.arranger.findUnique({
      where: { id: id },
    });
    if (!arranger) {
      throw new ArrangerNotFoundException(id);
    }
    return arranger;
  }

  async findOrganization(id: string) {
    /* finds the organization that the arranger is associated with
    Args: id - string
    Returns: Organization object
    */
    const arranger = await this.prismaService.arranger.findUnique({
      where: { id: id },
      include: {
        organization: {
          select: { id: true, urlId: true },
        },
      },
    });
    if (!arranger) {
      throw new ArrangerNotFoundException(id);
    }
    return arranger.organization;
  }

  async remove(id: string) {
    // A missing row raises P2025, which PrismaExceptionFilter turns into 404.
    return await this.prismaService.arranger.delete({
      where: { id: id },
    });
  }
}
