import { RegStatus } from "../../generated/prisma/client";
import { CommonRegistrationService } from "./common.registrations.service";

const EVENT_ID = "event-1";
const USER_ID = "user-1";

describe("CommonRegistrationService.findOne", () => {
  const setup = (registration: unknown) => {
    const prisma = {
      registration: {
        findUnique: jest.fn().mockResolvedValue(registration),
      },
    } as any;

    return {
      service: new CommonRegistrationService(prisma, {} as any),
      prisma,
    };
  };

  it("reads the one registration the event and user pair identifies", async () => {
    const { service, prisma } = setup({
      eventId: EVENT_ID,
      userId: USER_ID,
      regStatus: RegStatus.WAITLISTED,
    });

    await expect(service.findOne(EVENT_ID, USER_ID)).resolves.toEqual(
      expect.objectContaining({ regStatus: RegStatus.WAITLISTED }),
    );
    expect(prisma.registration.findUnique).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId: EVENT_ID, userId: USER_ID } },
    });
  });

  it("answers null when the user never registered", async () => {
    const { service } = setup(null);

    await expect(service.findOne(EVENT_ID, USER_ID)).resolves.toBeNull();
  });
});
