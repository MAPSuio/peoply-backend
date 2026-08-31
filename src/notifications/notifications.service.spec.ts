import { NotificationsService } from "./notifications.service";
import { NotificationType } from "./notifications.constants";
import { MAX_PAGE_SIZE } from "../util/pagination";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NEWEST_FIRST_START = new Date("2026-08-31T12:00:00.000Z").getTime();

function invitationsNewestFirst(idPrefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${idPrefix}-${index}`,
    createdAt: new Date(NEWEST_FIRST_START - index * DAY_IN_MS),
  }));
}

describe("NotificationsService.findAllPendingByUserId", () => {
  const eventInvitations = { findAllPendingInvitationsToUser: jest.fn() };
  const organizationInvitations = {
    findAllPendingInvitationsToUser: jest.fn(),
  };
  const coOrganizerInvitations = { findAllPendingForUser: jest.fn() };

  const service = new NotificationsService(
    eventInvitations as any,
    organizationInvitations as any,
    coOrganizerInvitations as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    eventInvitations.findAllPendingInvitationsToUser.mockResolvedValue([]);
    organizationInvitations.findAllPendingInvitationsToUser.mockResolvedValue(
      [],
    );
    coOrganizerInvitations.findAllPendingForUser.mockResolvedValue([]);
  });

  it("asks every source for skip + take rows, since the page can come from any one of them", async () => {
    await service.findAllPendingByUserId("user-1", { skip: 40, take: 10 });

    expect(
      eventInvitations.findAllPendingInvitationsToUser,
    ).toHaveBeenCalledWith("user-1", 50);
    expect(
      organizationInvitations.findAllPendingInvitationsToUser,
    ).toHaveBeenCalledWith("user-1", 50);
    expect(coOrganizerInvitations.findAllPendingForUser).toHaveBeenCalledWith(
      "user-1",
      50,
    );
  });

  it("bounds the sources at the row cap when the caller sent no page", async () => {
    await service.findAllPendingByUserId("user-1");

    expect(
      eventInvitations.findAllPendingInvitationsToUser,
    ).toHaveBeenCalledWith("user-1", MAX_PAGE_SIZE);
  });

  it("returns the page of the merged list, not a page per source", async () => {
    eventInvitations.findAllPendingInvitationsToUser.mockResolvedValue(
      invitationsNewestFirst("event", 5),
    );
    organizationInvitations.findAllPendingInvitationsToUser.mockResolvedValue([
      {
        id: "organization-0",
        createdAt: new Date(NEWEST_FIRST_START + DAY_IN_MS),
      },
    ]);

    const page = await service.findAllPendingByUserId("user-1", {
      skip: 0,
      take: 2,
    });

    expect(page.map(({ id }) => id)).toEqual(["organization-0", "event-0"]);
    expect(page[0].type).toBe(NotificationType.INVITATION_ORGANIZATION);
  });

  it("splits rows sharing a timestamp across pages without repeating one", async () => {
    const sameInstant = new Date(NEWEST_FIRST_START);
    eventInvitations.findAllPendingInvitationsToUser.mockResolvedValue([
      { id: "aaa", createdAt: sameInstant },
      { id: "ccc", createdAt: sameInstant },
    ]);
    organizationInvitations.findAllPendingInvitationsToUser.mockResolvedValue([
      { id: "bbb", createdAt: sameInstant },
    ]);

    const firstPage = await service.findAllPendingByUserId("user-1", {
      skip: 0,
      take: 2,
    });
    const secondPage = await service.findAllPendingByUserId("user-1", {
      skip: 2,
      take: 2,
    });

    /* The merge breaks the tie on id descending, the same order the three
       source queries use, so the two pages partition the set. */
    expect(firstPage.map(({ id }) => id)).toEqual(["ccc", "bbb"]);
    expect(secondPage.map(({ id }) => id)).toEqual(["aaa"]);
  });

  it("keeps the second page correct when one source holds every row on it", async () => {
    eventInvitations.findAllPendingInvitationsToUser.mockResolvedValue(
      invitationsNewestFirst("event", 5),
    );

    const page = await service.findAllPendingByUserId("user-1", {
      skip: 2,
      take: 2,
    });

    expect(page.map(({ id }) => id)).toEqual(["event-2", "event-3"]);
  });
});
