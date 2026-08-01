import { OrganizationRole } from "../../generated/prisma/client";
import { UsersService } from "./users.service";

/**
 * Deleting an account cascades away the user's UserOrganizationRole rows. The
 * organization has its own arranger and survives, so an organization whose only
 * OWNER deleted their account was left permanently unmanageable - nobody can be
 * promoted to OWNER after the fact.
 */
describe("UsersService.remove and owned organizations", () => {
  const USER = "user-1";
  const ARRANGER = "arranger-1";

  /**
   * @param members rows in the organization other than the departing owner,
   *                in createdAt order
   */
  const setup = (
    owned: string[],
    members: Array<{ userId: string; role: OrganizationRole }>,
  ) => {
    const roleUpdate = jest.fn().mockResolvedValue({});
    const orgDelete = jest.fn().mockResolvedValue({});

    const trx = {
      userOrganizationRole: {
        findMany: jest
          .fn()
          .mockImplementation(async ({ where }: any) =>
            where.role === OrganizationRole.OWNER
              ? owned.map((organizationId) => ({ organizationId }))
              : members,
          ),
        update: roleUpdate,
      },
      organization: { delete: orgDelete },
      event: { deleteMany: jest.fn().mockResolvedValue({}) },
      arranger: { delete: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: USER, arrangerId: ARRANGER }),
      },
      $transaction: (fn: (t: typeof trx) => unknown) => fn(trx),
    } as any;

    const service = new UsersService(
      prisma,
      {} as any,
      {
        updateAllRegistrationsOfUserToNotGoing: jest
          .fn()
          .mockResolvedValue(undefined),
      } as any,
    );

    return { service, roleUpdate, orgDelete };
  };

  it("promotes the longest-standing admin", async () => {
    const { service, roleUpdate, orgDelete } = setup(
      ["org-1"],
      [
        { userId: "member-old", role: OrganizationRole.MEMBER },
        { userId: "admin-old", role: OrganizationRole.ADMIN },
        { userId: "admin-new", role: OrganizationRole.ADMIN },
      ],
    );

    await service.remove(USER);

    expect(roleUpdate).toHaveBeenCalledWith({
      where: {
        organizationId_userId: { organizationId: "org-1", userId: "admin-old" },
      },
      data: { role: OrganizationRole.OWNER },
    });
    expect(orgDelete).not.toHaveBeenCalled();
  });

  /* An admin outranks a member regardless of who joined first, so this cannot
     rely on the query's ordering alone. */
  it("falls back to the longest-standing member when there is no admin", async () => {
    const { service, roleUpdate } = setup(
      ["org-1"],
      [
        { userId: "member-old", role: OrganizationRole.MEMBER },
        { userId: "member-new", role: OrganizationRole.MEMBER },
      ],
    );

    await service.remove(USER);

    expect(roleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId: {
            organizationId: "org-1",
            userId: "member-old",
          },
        },
      }),
    );
  });

  it("deletes an organization with nobody left to hand it to", async () => {
    const { service, roleUpdate, orgDelete } = setup(["org-1"], []);

    await service.remove(USER);

    expect(roleUpdate).not.toHaveBeenCalled();
    expect(orgDelete).toHaveBeenCalledWith({ where: { id: "org-1" } });
  });

  it("handles someone who owns several organizations", async () => {
    const { service, roleUpdate } = setup(
      ["org-1", "org-2"],
      [{ userId: "admin-1", role: OrganizationRole.ADMIN }],
    );

    await service.remove(USER);

    expect(roleUpdate).toHaveBeenCalledTimes(2);
  });

  it("does nothing extra for a user who owns no organization", async () => {
    const { service, roleUpdate, orgDelete } = setup([], []);

    await service.remove(USER);

    expect(roleUpdate).not.toHaveBeenCalled();
    expect(orgDelete).not.toHaveBeenCalled();
  });
});
