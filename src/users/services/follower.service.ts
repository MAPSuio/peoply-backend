import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ArrangerNotFoundException } from "../../arrangers/exceptions";
import { PrismaError } from "../../prisma/prisma.constants";
import { UserDoesNotExistException } from "../exceptions";

@Injectable()
export class FollowService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return await this.prisma.arrangerFollower.findMany({
      where: {
        userId,
      },
      include: {
        arranger: {
          include: {
            organization: true,
            user: true,
          },
        },
      },
    });
  }

  async follow(userId: string, arrangerId: string) {
    // Get the user and check if it exists.
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new UserDoesNotExistException();
    }

    // Get the arranger and check if it exists.
    const arranger = await this.prisma.arranger.findUnique({
      where: {
        id: arrangerId,
      },
    });

    if (!arranger) {
      throw new ArrangerNotFoundException(arrangerId);
    }

    // Following twice raises P2002 -> 409. This used to answer 400.
    const arrangerFollower = await this.prisma.arrangerFollower.create({
      data: {
        arrangerId,
        userId,
      },
    });

    return arrangerFollower;
  }

  async unFollow(userId: string, arrangerId: string) {
    // The catch this replaces tested for P2001, which Prisma does not raise
    // here — a delete with no matching row raises P2025. Unfollowing an
    // arranger you were not following answered 500 instead of 404.
    return await this.prisma.arrangerFollower.delete({
      where: {
        arrangerId_userId: { arrangerId, userId },
      },
    });
  }
}
