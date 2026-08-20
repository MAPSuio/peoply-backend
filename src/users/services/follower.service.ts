import { PrismaService } from "../../prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { ArrangerNotFoundException } from "../../arrangers/exceptions";
import { UserDoesNotExistException } from "../exceptions";
import { PUBLIC_USER_SELECT } from "../user.select";
import { FollowAction } from "../../generated/prisma/client";

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
            // Following is self-service, so `user: true` here let any account
            // follow an arbitrary personal arranger and read back their full
            // row — email, phone, birthDate and refreshTokenId included.
            user: { select: PUBLIC_USER_SELECT },
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
    // The follower row and its log entry commit or roll back together, so a
    // rejected duplicate never leaves a stray FOLLOW event behind.
    const [arrangerFollower] = await this.prisma.$transaction([
      this.prisma.arrangerFollower.create({
        data: {
          arrangerId,
          userId,
        },
      }),
      this.prisma.arrangerFollowerEvent.create({
        data: { arrangerId, action: FollowAction.FOLLOW },
      }),
    ]);

    return arrangerFollower;
  }

  async unFollow(userId: string, arrangerId: string) {
    // The catch this replaces tested for P2001, which Prisma does not raise
    // here — a delete with no matching row raises P2025. Unfollowing an
    // arranger you were not following answered 500 instead of 404.
    // Delete and log entry share a transaction: a P2025 rollback leaves no
    // orphaned UNFOLLOW event.
    const [arrangerFollower] = await this.prisma.$transaction([
      this.prisma.arrangerFollower.delete({
        where: {
          arrangerId_userId: { arrangerId, userId },
        },
      }),
      this.prisma.arrangerFollowerEvent.create({
        data: { arrangerId, action: FollowAction.UNFOLLOW },
      }),
    ]);

    return arrangerFollower;
  }
}
