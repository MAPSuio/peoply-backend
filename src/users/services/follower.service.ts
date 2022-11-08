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

    try {
      const arrangerFollower = await this.prisma.arrangerFollower.create({
        data: {
          arrangerId,
          userId,
        },
      });

      return arrangerFollower;
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.DuplicateUniqueValue
      ) {
        throw new BadRequestException(
          "User is already following this arranger",
        );
      } else {
        throw error;
      }
    }
  }

  async unFollow(userId: string, arrangerId: string) {
    try {
      return await this.prisma.arrangerFollower.delete({
        where: {
          arrangerId_userId: { arrangerId, userId },
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.DoesNotExist
      ) {
        throw new NotFoundException("User is not following this arranger.");
      } else {
        throw error;
      }
    }
  }
}
