import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";

@Injectable()
export class OrganizationRegService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(event_id: number) {
    return;
  }

  async findOne(event_id: number, user_id: string) {
    return;
  }

  async update(event_id: number, user_id: string) {
    return;
  }

  async remove(event_id: number, user_id: string) {
    return;
  }
}
