jest.mock("node-ical", () => ({
  sync: {
    parseICS: jest.fn(),
  },
}));

import { NotFoundException } from "@nestjs/common";
import { IcsFeedsService } from "./ics-feeds.service";

/* Kept out of ics-feeds.service.spec.ts because the delete path is the only
   one that needs $transaction and event.updateMany on the Prisma double. */
describe("IcsFeedsService.deleteOrganizationFeed", () => {
  const event = { updateMany: jest.fn() };
  const organizationIcsFeed = { findUnique: jest.fn(), delete: jest.fn() };
  const prisma = {
    event,
    organizationIcsFeed,
    $transaction: jest.fn((fn: any) => fn({ event, organizationIcsFeed })),
  } as any;

  let service: IcsFeedsService;

  beforeEach(() => {
    jest.clearAllMocks();
    event.updateMany.mockResolvedValue({ count: 0 });
    organizationIcsFeed.delete.mockResolvedValue({ id: "feed-1" });
    service = new IcsFeedsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it("throws when the organization has no feed", async () => {
    organizationIcsFeed.findUnique.mockResolvedValueOnce(null);

    await expect(service.deleteOrganizationFeed("org-1")).rejects.toThrow(
      NotFoundException,
    );
    expect(organizationIcsFeed.delete).not.toHaveBeenCalled();
  });

  it("archives the imported events instead of letting the cascade delete them", async () => {
    organizationIcsFeed.findUnique.mockResolvedValueOnce({
      id: "feed-1",
      organizationId: "org-1",
    });

    await service.deleteOrganizationFeed("org-1");

    expect(event.updateMany).toHaveBeenNthCalledWith(1, {
      where: { organizationIcsFeedId: "feed-1", archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it("detaches every event from the feed before deleting it", async () => {
    organizationIcsFeed.findUnique.mockResolvedValueOnce({
      id: "feed-1",
      organizationId: "org-1",
    });

    await service.deleteOrganizationFeed("org-1");

    /* Order is the whole fix: detaching after the archive keeps the rows
       outside the FK cascade, and both must precede the delete. */
    const detach = event.updateMany.mock.invocationCallOrder[1];
    const remove = organizationIcsFeed.delete.mock.invocationCallOrder[0];

    expect(event.updateMany).toHaveBeenNthCalledWith(2, {
      where: { organizationIcsFeedId: "feed-1" },
      data: { organizationIcsFeedId: null },
    });
    expect(detach).toBeLessThan(remove);
  });

  it("keeps already-archived events out of the cascade too", async () => {
    organizationIcsFeed.findUnique.mockResolvedValueOnce({
      id: "feed-1",
      organizationId: "org-1",
    });

    await service.deleteOrganizationFeed("org-1");

    /* The detach must not carry archivedAt: null, or rows archived by an
       earlier sync stay attached and are deleted with the feed. */
    const [, detachCall] = event.updateMany.mock.calls;
    expect(detachCall[0].where).not.toHaveProperty("archivedAt");
  });

  it("runs the archive, the detach and the delete in one transaction", async () => {
    organizationIcsFeed.findUnique.mockResolvedValueOnce({
      id: "feed-1",
      organizationId: "org-1",
    });

    await service.deleteOrganizationFeed("org-1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
