import {
  Event,
  Prisma,
  RegStatus,
  Registration,
} from "../../generated/prisma/client";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { lockEventForSeatChange } from "../event-seat-lock";
import { assertRegistrationWindowOpen } from "../registration-window";
import { AzureCommunicationService } from "../../azure/azure-communication.service";
import { PrismaService } from "../../prisma/prisma.service";
import { buildWaitlistedToGoingHtmlEmail } from "../../util/email";
import { ForeignKeyNotFoundException } from "../exceptions";

/**
 * The client inside a `$transaction` callback. The helpers below take it
 * rather than reaching for `this.prismaService`, so they cannot accidentally
 * run outside the row lock their caller is holding.
 */
type TransactionClient = Prisma.TransactionClient;

/** An event read with its registrations, which is what the seat maths needs. */
type EventWithRegistrations = Event & { registrations: Registration[] };

/**
 * Options for {@link CommonRegistrationService.updateRegistration}.
 */
export interface UpdateRegistrationOptions {
  /**
   * Skip the guards that exist to stop a *user* from changing their own
   * registration at the wrong time: the event has ended, registration has not
   * opened, registration has closed, or the event is not registered through
   * Peoply.
   *
   * Those guards are meaningless when the system itself is releasing a seat —
   * deleting an account must free the spot for the waitlist regardless of
   * whether registration happens to be closed at that moment.
   *
   * Never set this from a request handler.
   */
  systemInitiated?: boolean;
}

@Injectable()
export class CommonRegistrationService {
  // Resolves to the concrete subclass name, so waitlist and cleanup warnings
  // are attributable to the service that actually ran.
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prismaService: PrismaService,
    protected readonly azureCommunicationService: AzureCommunicationService,
  ) {}

  async findOne(eventId: string, userId: string) {
    const registration = await this.prismaService.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    return registration;
  }

  /**
   * The shared opening of every seat-changing transaction: take the event
   * lock, load the event with its registrations in waitlist order, and find
   * the caller's own row. The lock comes first so two concurrent seat
   * changes cannot both read the same waitlist head.
   */
  private async lockAndLoadRegistration(
    trx: TransactionClient,
    eventId: string,
    userId: string,
  ) {
    await lockEventForSeatChange(trx, eventId);

    const event = await trx.event.findUnique({
      where: { id: eventId },
      include: { registrations: { orderBy: { updatedAt: "asc" } } },
    });

    const existingReg = event?.registrations.find(
      (registration) =>
        registration.eventId === eventId && registration.userId === userId,
    );

    return { event, existingReg };
  }

  async remove(eventId: string, userId: string) {
    // P2025 from the delete below becomes 404 in PrismaExceptionFilter.
    return await this.prismaService.$transaction(async (trx) => {
      /* Deleting a registration frees a seat and promotes the head of the
         waitlist. Two concurrent removals used to read the same
         `waitlisted[0]` and both promote that one person: two seats freed, one
         filled, and the second lost with people still waiting. */
      const { event, existingReg } = await this.lockAndLoadRegistration(
        trx,
        eventId,
        userId,
      );

      if (event?.regStart && new Date() < event.regStart) {
        throw new Error("Registration is not open yet");
      }

      if (event?.regEnd && new Date() > event.regEnd) {
        throw new Error("Registration closed");
      }

      if (!event || !existingReg) {
        throw new ForeignKeyNotFoundException(eventId, userId);
      }

      const reg = await trx.registration.delete({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existingReg.regStatus === RegStatus.GOING) {
        /* No email here, unlike the promotion in updateRegistration. That is
           how it has always been, not a decision this split made. */
        await this.promoteFirstWaitlisted(trx, eventId, event.registrations);
      }

      return reg;
    });
  }

  /**
   * The guards that stop a *user* from changing their own registration at the
   * wrong time. Skipped for system-initiated changes — see
   * {@link UpdateRegistrationOptions.systemInitiated}.
   */
  private setRegistrationStatus(
    trx: TransactionClient,
    eventId: string,
    userId: string,
    regStatus: RegStatus,
    formAnswer: string | null | undefined,
  ) {
    return trx.registration.update({
      where: { eventId_userId: { eventId, userId } },
      data: { regStatus, formAnswer },
    });
  }

  /**
   * Moves the user who has waited longest into a seat that just came free, and
   * answers with them so the caller can tell them about it.
   *
   * The registrations are ordered by `updatedAt` where they are read, so the
   * head of the list is the head of the queue. Both callers hold the event row
   * while they run — without it, two concurrent releases read the same head and
   * both promote that one person, filling one of the two seats and losing the
   * other with people still waiting.
   */
  private async promoteFirstWaitlisted(
    trx: TransactionClient,
    eventId: string,
    registrations: Registration[],
  ) {
    const waitlisted = registrations.filter(
      (registration) => registration.regStatus === RegStatus.WAITLISTED,
    );

    if (waitlisted.length === 0) {
      return null;
    }

    const nextGoing = waitlisted[0];

    await trx.registration.update({
      where: { eventId_userId: { eventId, userId: nextGoing.userId } },
      data: { regStatus: RegStatus.GOING },
    });

    return nextGoing;
  }

  /**
   * Tells a promoted user they got in.
   *
   * The promotion itself must not be rolled back because the notification
   * failed, so this stays caught — but it is awaited and logged: unawaited, the
   * try/catch could never observe a rejected send, and the empty block
   * discarded the reason.
   */
  private async notifyPromotedUser(
    trx: TransactionClient,
    event: EventWithRegistrations,
    userId: string,
  ) {
    const nextGoingUser = await trx.user.findUnique({ where: { id: userId } });

    try {
      if (nextGoingUser?.allowEmailFromArranger) {
        await this.azureCommunicationService.send({
          senderAddress: "no-reply@peoply.app",
          recipients: {
            to: [{ address: nextGoingUser.email }],
          },
          content: {
            subject: `Peoply: Du har fått plass på "${event.title}"`,
            html: buildWaitlistedToGoingHtmlEmail(event),
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Promoted user ${userId} from the waitlist on event ${
          event.id
        }, but the notification email failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * NOT_GOING or INVITED -> GOING. Reads `going.length < capacity`, so it must
   * run with the event row held.
   */
  private takeSeat(
    trx: TransactionClient,
    event: EventWithRegistrations,
    userId: string,
    formAnswer?: string,
  ) {
    if (event.formQuestion && !formAnswer) {
      throw new BadRequestException("Form answer is required for this event");
    }

    const going = event.registrations.filter(
      (registration) => registration.regStatus === RegStatus.GOING,
    );
    const hasRoom = event.capacity === null || going.length < event.capacity;

    return this.setRegistrationStatus(
      trx,
      event.id,
      userId,
      hasRoom ? RegStatus.GOING : RegStatus.WAITLISTED,
      formAnswer,
    );
  }

  /**
   * GOING -> NOT_GOING or BANNED. Frees a seat, so the head of the waitlist
   * takes it.
   */
  private async releaseSeat(
    trx: TransactionClient,
    event: EventWithRegistrations,
    userId: string,
    regStatus: RegStatus,
  ) {
    /* Awaited before the promotion rather than returned: unawaited, the
       leaver's row settled after the promotion instead of before it. */
    const registration = await this.setRegistrationStatus(
      trx,
      event.id,
      userId,
      regStatus,
      null,
    );

    const promoted = await this.promoteFirstWaitlisted(
      trx,
      event.id,
      event.registrations,
    );

    if (promoted) {
      await this.notifyPromotedUser(trx, event, promoted.userId);
    }

    return registration;
  }

  /**
   * Picks the transition `from -> to` is, and runs it.
   *
   * Only three combinations do anything. Every other one is a no-op and has
   * been all along: the caller gets undefined back and the registration is
   * left as it was.
   */
  private async applyTransition(
    trx: TransactionClient,
    event: EventWithRegistrations,
    userId: string,
    from: RegStatus,
    to: RegStatus,
    formAnswer?: string,
  ) {
    const isJoining =
      from === RegStatus.NOT_GOING || from === RegStatus.INVITED;

    if (to === RegStatus.GOING && isJoining) {
      return await this.takeSeat(trx, event, userId, formAnswer);
    }

    const isLeavingSeat = to === RegStatus.NOT_GOING || to === RegStatus.BANNED;

    if (isLeavingSeat && from === RegStatus.GOING) {
      return await this.releaseSeat(trx, event, userId, to);
    }

    if (to === RegStatus.NOT_GOING && from === RegStatus.WAITLISTED) {
      /* Nobody was holding a seat, so nothing frees up for the waitlist. */
      return await this.setRegistrationStatus(trx, event.id, userId, to, null);
    }

    return undefined;
  }

  async updateRegistration(
    userId: string,
    eventId: string,
    regStatus: RegStatus,
    formAnswer?: string,
    options: UpdateRegistrationOptions = {},
  ) {
    // Awaited, not returned unawaited: the transaction must settle here so
    // the seat is released before the caller continues. P2025 from either
    // update becomes 404 in PrismaExceptionFilter.
    return await this.prismaService.$transaction(async (trx) => {
      /* This path both takes a seat (NOT_GOING/INVITED -> GOING, which reads
         `going.length < capacity`) and frees one (-> NOT_GOING, which promotes
         the head of the waitlist). Both are read-modify-writes on the same
         count, so both need the event held for the duration. */
      const { event, existingReg } = await this.lockAndLoadRegistration(
        trx,
        eventId,
        userId,
      );

      /* The guards run before the registration row is checked, as they always
         have: an event whose registration has closed answers with that rather
         than with "no such registration". A missing event skips them, because
         there is nothing to be open or closed. */
      if (!options.systemInitiated) {
        assertRegistrationWindowOpen(event);
      }

      if (!event || !existingReg) {
        throw new ForeignKeyNotFoundException(eventId, userId);
      }

      return await this.applyTransition(
        trx,
        event,
        userId,
        existingReg.regStatus,
        regStatus,
        formAnswer,
      );
    });
  }
}
