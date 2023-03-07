import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AllergensService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return await this.prisma.allergen.findMany();
  }
}
