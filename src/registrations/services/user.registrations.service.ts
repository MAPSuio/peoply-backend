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
  Registration,
} from "../../generated/prisma/client";
import {
  registrationGrantsEventAccess,
  viewableEventIds,
} from "../registration-visibility";
import { EventNotFoundException } from "../../events/exceptions";
import { lockEventForSeatChange } from "../event-seat-lock";
import { AzureCommunicationService } from "../../azure/azure-communication.service";

@Injectable()
export class UserRegistrationService extends CommonRegistrationService {
  constructor(
    prismaService: PrismaService,
    azureCommunicationService: AzureCommunicationService,
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

      if (event?.endDate && new Date() > event.endDate) {
        throw new BadRequestException("Event has ended");
      }

      if (event?.regStart && new Date() < event.regStart) {
        throw new BadRequestException("Registration has not opened yet");
      }

      if (event?.regEnd && new Date() > event.regEnd) {
        throw new BadRequestException("Registration has closed");
      }

      if (event?.formQuestion && !createRegistrationDto.formAnswer) {
        throw new BadRequestException("Form answer is required");
      }

      if (event?.hasFood && !user?.foodPreference) {
        throw new BadRequestException("Food preference is required");
      }

      if (event) {
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

  async findAll(
    searchProps: SearchUserRegistrationDto,
    userId: string,
    skip = 0,
    take = 10,
    orderBy: keyof Registration = "updatedAt",
    orderDirection: "asc" | "desc" = "asc",
  ) {
    /* create a dummy object to type check runtime */
    const dummy: Registration = {
      eventId: "",
      userId: "",
      regStatus: RegStatus.GOING,
      formAnswer: "",
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    /* Check if orderBy is a key of Registration */
    if (!Object.keys(dummy).includes(orderBy)) {
      throw new BadRequestException(`${orderBy} is not a key of Registration`);
    }

    const registrations = await this.prismaService.registration.findMany({
      skip,
      take,
      where: {
        userId,
        regStatus: searchProps.regStatus,
      },
      include: {
        event: new Boolean(searchProps.includeEvent).valueOf() && {
          include: {
            eventArrangers: new Boolean(
              searchProps.includeArrangers,
            ).valueOf() && {
              include: {
                arranger: {
                  include: {
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                        image: true,
                      },
                    },
                    organization: { select: { name: true, image: true } },
                  },
                },
              },
            },
          },
        },
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
        !registrationGrantsEventAccess(
          (registration.event as { visibility: EventVisibility }).visibility,
          registration.regStatus,
        ),
    );

    if (unviewable.length === 0) {
      return registrations;
    }

    /* Arranging an event is its own grant, independent of the registration -
       so before redacting, check whether the caller arranges any of these. */
    const viewable = await viewableEventIds(
      this.prismaService,
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
