import { BadRequestException, Injectable } from "@nestjs/common";
import { CommonRegistrationService } from "./common.registrations.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateRegistrationDto,
  SearchUserRegistrationDto,
  UserUpdateRegistrationDto,
} from "../dto";
import {
  EventRegistrationMode,
  EventVisibility,
  RegStatus,
} from "../../generated/prisma/client";
import { EventAccessService } from "../../event-access/event-access.service";
import { eventCardInclude } from "../../events/event.select";
import { EventNotFoundException } from "../../events/exceptions";
import { lockEventForSeatChange } from "../event-seat-lock";
import { assertRegistrationWindowOpen } from "../registration-window";
import { AzureCommunicationService } from "../../azure/azure-communication.service";
import { ALL_ROWS } from "../../util/pagination";

@Injectable()
export class UserRegistrationService extends CommonRegistrationService {
  constructor(
    prismaService: PrismaService,
    azureCommunicationService: AzureCommunicationService,
    private readonly eventAccess: EventAccessService,
  ) {
    super(prismaService, azureCommunicationService);
  }

  async create(userId: string, createRegistrationDto: CreateRegistrationDto) {
    // P2002 (already registered) -> 409 and P2003 (no such event or user)
    // -> 400, both handled by PrismaExceptionFilter.
    return this.prismaService.$transaction(async (trx) => {
      /* Before the seat count is read, so two concurrent registrations for the
         same event cannot both see the last free seat. */
      await lockEventForSeatChange(trx, createRegistrationDto.eventId);

      const event = await trx.event.findUnique({
        where: { id: createRegistrationDto.eventId },
        include: {
          registrations: { where: { regStatus: RegStatus.GOING } },
        },
      });

      const user = await trx.user.findUnique({
        where: { id: userId },
      });

      assertRegistrationWindowOpen(event, { requirePeoplyMode: false });

      if (event?.formQuestion && !createRegistrationDto.formAnswer) {
        throw new BadRequestException("Form answer is required");
      }

      if (event?.hasFood && !user?.foodPreference) {
        throw new BadRequestException("Food preference is required");
      }

      if (event) {
        /* Invitation creates the INVITED registration up front. Invitees must
         * update that row; allowing create here would also grant event access. */
        if (event.visibility === EventVisibility.PRIVATE) {
          throw new EventNotFoundException(event.id);
        }

        if (event.registrationMode !== EventRegistrationMode.PEOPLY) {
          throw new BadRequestException(
            "Registration for this event does not happen in Peoply",
          );
        }

        if (createRegistrationDto.regStatus === RegStatus.GOING) {
          if (
            event.capacity === null ||
            event.registrations.length < event.capacity
          ) {
            return trx.registration.create({
              data: { ...createRegistrationDto, userId },
            });
          } else {
            return trx.registration.create({
              data: {
                eventId: createRegistrationDto.eventId,
                userId,
                regStatus: RegStatus.WAITLISTED,
                formAnswer: createRegistrationDto.formAnswer,
              },
            });
          }
        } else if (createRegistrationDto.regStatus === RegStatus.INVITED) {
          return trx.registration.create({
            data: { ...createRegistrationDto, userId },
          });
        } else {
          /* Not possible to create with NOT_GOING_ since this only makes sense if invited */
          /* Also not possible with WAITLISTED, since this is handled in GOING case */
          throw new BadRequestException("Invalid registration status");
        }
      } else {
        throw new EventNotFoundException();
      }
    });
  }

  async findAll(searchProps: SearchUserRegistrationDto, userId: string) {
    const {
      skip = 0,
      take = 10,
      orderBy = "updatedAt",
      orderDirection = "asc",
    } = searchProps;

    const registrations = await this.prismaService.registration.findMany({
      skip,
      take,
      where: {
        userId,
        regStatus: searchProps.regStatus,
      },
      include: {
        event: eventCardInclude(searchProps),
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });

    return this.redactUnviewableEvents(registrations, userId);
  }

  /**
   * `GET /events/:id` refuses a non-public event to anyone whose registration
   * is `NOT_GOING` or `BANNED`. This endpoint returned the whole event row
   * regardless, so the caller's own registration list was a way back into an
   * event they had been thrown out of - address, capacity, form question and
   * all, updated live rather than frozen at the time of the ban.
   *
   * The rows themselves stay: a user is entitled to see that they declined or
   * were banned. It is the event payload that goes.
   */
  private async redactUnviewableEvents<
    T extends { eventId: string; regStatus: RegStatus; event?: unknown },
  >(registrations: T[], userId: string) {
    const unviewable = registrations.filter(
      (registration) =>
        registration.event &&
        !this.eventAccess.registrationGrantsEventAccess(
          (registration.event as { visibility: EventVisibility }).visibility,
          registration.regStatus,
        ),
    );

    if (unviewable.length === 0) {
      return registrations;
    }

    /* Arranging an event is its own grant, independent of the registration -
       so before redacting, check whether the caller arranges any of these. */
    const viewable = await this.eventAccess.viewableEventIds(
      userId,
      unviewable.map(({ eventId }) => eventId),
    );

    for (const registration of unviewable) {
      if (!viewable.has(registration.eventId)) {
        registration.event = undefined;
      }
    }

    return registrations;
  }

  /**
   * Releases a user's held spots before their account is deleted, so that
   * waitlisted attendees are promoted into the seats being freed.
   *
   * Only upcoming events are touched: a past event has no spot left to free.
   * The release runs as systemInitiated, so an event whose registration has
   * already closed still gives its seat back — the user is not choosing to
   * leave, their account is being deleted.
   *
   * A registration that cannot be released must not block the deletion, so
   * failures are logged and the remaining registrations are still processed.
   */
  async updateAllRegistrationsOfUserToNotGoing(userId: string) {
    const registrations = await this.prismaService.registration.findMany({
      take: ALL_ROWS,
      where: {
        userId,
        regStatus: { in: [RegStatus.GOING, RegStatus.WAITLISTED] },
        event: {
          OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
        },
      },
      select: { eventId: true },
    });

    // Sequential on purpose: updateRegistration opens its own transaction per
    // call and promotes from the waitlist, so concurrent calls would race.
    for (const registration of registrations) {
      try {
        await super.updateRegistration(
          userId,
          registration.eventId,
          RegStatus.NOT_GOING,
          undefined,
          // The user is not choosing to leave — their account is going away.
          // Registration being closed must not strand the seat.
          { systemInitiated: true },
        );
      } catch (error) {
        this.logger.warn(
          `Could not release registration for user ${userId} on event ${
            registration.eventId
          }: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  async update(userId: string, dto: UserUpdateRegistrationDto) {
    return super.updateRegistration(
      userId,
      dto.eventId,
      dto.regStatus,
      dto.formAnswer,
    );
  }

  async getPositionInWaitlist(eventId: string, userId: string) {
    const registrations = await this.prismaService.registration.findMany({
      take: ALL_ROWS,
      where: {
        eventId,
        regStatus: RegStatus.WAITLISTED,
      },
      orderBy: {
        updatedAt: "asc",
      },
    });

    const index = registrations.findIndex(
      (registration) => registration.userId === userId,
    );

    return index + 1;
  }
}
