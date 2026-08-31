import { FollowService } from "./follower.service";
import { UserDoesNotExistException } from "../exceptions";
import { ArrangerNotFoundException } from "../../arrangers/exceptions";
import { MAX_PAGE_SIZE } from "../../util/pagination";

describe("FollowService", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    arranger: {
      findUnique: jest.fn(),
    },
    arrangerFollower: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    arrangerFollowerEvent: {
      create: jest.fn(),
    },
    /* Array-form transaction: the delegates above return the operations, the
       transaction resolves them together. Same object: these tests assert on
       the calls, not on transactional isolation. */
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };

  let service: FollowService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
    service = new FollowService(prisma as any);
  });

  describe("findAll", () => {
    it("asks the database for the page rather than every row", async () => {
      await service.findAll("user-1", { skip: 30, take: 10 });

      expect(prisma.arrangerFollower.findMany.mock.calls[0][0]).toMatchObject({
        skip: 30,
        take: 10,
        orderBy: { createdAt: "desc" },
      });
    });

    it("bounds the page at the row cap when the caller sent none", async () => {
      await service.findAll("user-1");

      expect(prisma.arrangerFollower.findMany.mock.calls[0][0]).toMatchObject({
        skip: 0,
        take: MAX_PAGE_SIZE,
      });
    });
  });

  describe("follow", () => {
    it("creates the follower row and a FOLLOW event in one transaction", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
      prisma.arranger.findUnique.mockResolvedValueOnce({ id: "arranger-1" });
      const followerRow = { arrangerId: "arranger-1", userId: "user-1" };
      prisma.arrangerFollower.create.mockResolvedValueOnce(followerRow);
      prisma.arrangerFollowerEvent.create.mockResolvedValueOnce({});

      await expect(service.follow("user-1", "arranger-1")).resolves.toEqual(
        followerRow,
      );

      expect(prisma.arrangerFollower.create).toHaveBeenCalledWith({
        data: { arrangerId: "arranger-1", userId: "user-1" },
      });
      expect(prisma.arrangerFollowerEvent.create).toHaveBeenCalledWith({
        data: { arrangerId: "arranger-1", action: "FOLLOW" },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("throws when the user does not exist and writes no event", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.follow("ghost", "arranger-1")).rejects.toThrow(
        UserDoesNotExistException,
      );

      expect(prisma.arrangerFollowerEvent.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("throws when the arranger does not exist and writes no event", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
      prisma.arranger.findUnique.mockResolvedValueOnce(null);

      await expect(service.follow("user-1", "ghost")).rejects.toThrow(
        ArrangerNotFoundException,
      );

      expect(prisma.arrangerFollowerEvent.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("unFollow", () => {
    it("deletes the follower row and writes an UNFOLLOW event in one transaction", async () => {
      const deletedRow = { arrangerId: "arranger-1", userId: "user-1" };
      prisma.arrangerFollower.delete.mockResolvedValueOnce(deletedRow);
      prisma.arrangerFollowerEvent.create.mockResolvedValueOnce({});

      await expect(service.unFollow("user-1", "arranger-1")).resolves.toEqual(
        deletedRow,
      );

      expect(prisma.arrangerFollower.delete).toHaveBeenCalledWith({
        where: {
          arrangerId_userId: { arrangerId: "arranger-1", userId: "user-1" },
        },
      });
      expect(prisma.arrangerFollowerEvent.create).toHaveBeenCalledWith({
        data: { arrangerId: "arranger-1", action: "UNFOLLOW" },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("propagates the P2025 rejection when the row does not exist", async () => {
      const p2025 = Object.assign(new Error("Record not found"), {
        code: "P2025",
      });
      prisma.$transaction.mockImplementationOnce(() => Promise.reject(p2025));

      await expect(service.unFollow("user-1", "arranger-1")).rejects.toBe(
        p2025,
      );
    });
  });
});
