import {
  EventRegistrationMode,
  RegStatus,
} from "../../generated/prisma/client";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { AzureCommunicationService } from "../../azure/azure-communication.service";
import { PrismaService } from "../../prisma/prisma.service";
import { buildWaitlistedToGoingHtmlEmail } from "../../util/email";
import { ForeignKeyNotFoundException } from "../exceptions";

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

  async remove(eventId: string, userId: string) {
    // P2025 from the delete below becomes 404 in PrismaExceptionFilter.
    return await this.prismaService.$transaction(async (trx) => {
      const event = await trx.event.findUnique({
        where: { id: eventId },
        include: { registrations: { orderBy: { updatedAt: "asc" } } },
      });

      /* Bare Error is not an HttpException, so PrismaExceptionFilter passes
         it through and Nest answers 500 - a caller asking to unregister after
         registration closed got "Internal server error" instead of being told
         why. The sibling checks in updateRegistration already use
         BadRequestException. */
      if (event?.regStart && new Date() < event.regStart) {
        throw new BadRequestException("Registration is not open yet");
      }

      if (event?.regEnd && new Date() > event.regEnd) {
        throw new BadRequestException("Registration closed");
      }

      const existingReg = event?.registrations.find(
        (reg) => reg.userId === userId && reg.eventId === eventId,
      );

      if (event && existingReg) {
        const reg = await trx.registration.delete({
          where: { eventId_userId: { eventId, userId } },
        });

        if (existingReg.regStatus === RegStatus.GOING) {
          const waitlisted = event.registrations.filter(
            (reg) => reg.regStatus === RegStatus.WAITLISTED,
          );

          if (waitlisted.length !== 0) {
            const nextGoing = waitlisted[0];

            await trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: nextGoing.eventId,
                  userId: nextGoing.userId,
                },
              },
              data: { regStatus: RegStatus.GOING },
            });
          }
        }

        return reg;
      } else {
        throw new ForeignKeyNotFoundException(eventId, userId);
      }
    });
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
      const event = await trx.event.findUnique({
        where: { id: eventId },
        include: {
          registrations: { orderBy: { updatedAt: "asc" } },
        },
      });

      if (!options.systemInitiated) {
        if (event?.endDate && new Date() > event.endDate) {
          throw new BadRequestException("Event has ended");
        }

        if (event?.regStart && new Date() < event.regStart) {
          throw new BadRequestException("Registration has not opened yet");
        }

        if (event?.regEnd && new Date() > event.regEnd) {
          throw new BadRequestException("Registration has closed");
        }

        if (event && event.registrationMode !== EventRegistrationMode.PEOPLY) {
          throw new BadRequestException(
            "Registration for this event does not happen in Peoply",
          );
        }
      }

      const existingReg = event?.registrations.find(
        (registration) =>
          registration.eventId === eventId && registration.userId === userId,
      );

      if (event && existingReg) {
        const going = event.registrations.filter(
          (registration) => registration.regStatus === RegStatus.GOING,
        );

        /* If change from NOT_GOING to GOING */
        if (
          regStatus === RegStatus.GOING &&
          (existingReg.regStatus === RegStatus.NOT_GOING ||
            existingReg.regStatus === RegStatus.INVITED)
        ) {
          /* If event has no capacity or if there is free space
           * Just update registration status
           */
          if (event.formQuestion && !formAnswer) {
            throw new BadRequestException(
              "Form answer is required for this event",
            );
          }

          if (event.capacity === null || going.length < event.capacity) {
            return trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: eventId,
                  userId,
                },
              },
              data: {
                regStatus: regStatus,
                formAnswer,
              },
            });

            /* Else add to waitlist */
          } else {
            return trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: eventId,
                  userId,
                },
              },
              data: {
                regStatus: RegStatus.WAITLISTED,
                formAnswer,
              },
            });
          }

          /* If change from GOING to NOT_GOING
           * Check if there is anyone on waitlist
           */
        } else if (
          (regStatus === RegStatus.NOT_GOING ||
            regStatus === RegStatus.BANNED) &&
          existingReg.regStatus === RegStatus.GOING
        ) {
          const waitlisted = event.registrations.filter(
            (registration) => registration.regStatus === RegStatus.WAITLISTED,
          );

          /* Get current registration */
          const registration = await trx.registration.update({
            where: {
              eventId_userId: {
                eventId: eventId,
                userId,
              },
            },
            data: {
              regStatus: regStatus,
              formAnswer: null,
            },
          });

          /* If there is someone in waitlist, give space to first on waitlist */
          if (waitlisted.length !== 0) {
            const nextGoing = waitlisted[0];

            await trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: eventId,
                  userId: nextGoing.userId,
                },
              },
              data: {
                regStatus: RegStatus.GOING,
              },
            });

            const nextGoingUser = await trx.user.findUnique({
              where: { id: nextGoing.userId },
            });

            // The promotion itself must not be rolled back because the
            // notification failed, so this stays caught — but it is awaited
            // and logged: unawaited, the try/catch could never observe a
            // rejected send, and the empty block discarded the reason.
            try {
              /* This is the waitlist notification, so it is the waitlist
                 preference that governs it. `allowEmailOnWaitlist` is offered
                 in UpdateUserDto and stored on the row, but was read nowhere
                 in the codebase - a user who turned waitlist mail off still
                 got it, because the check used the general arranger flag.
                 Both must hold: the arranger flag is the blanket opt-out. */
              if (
                nextGoingUser?.allowEmailFromArranger &&
                nextGoingUser?.allowEmailOnWaitlist
              ) {
                await this.azureCommunicationService.send({
                  sender: "no-reply@peoply.app",
                  recipients: {
                    to: [{ email: nextGoingUser.email }],
                  },
                  content: {
                    subject: `Peoply: Du har fått plass på "${event.title}"`,
                    html: buildWaitlistedToGoingHtmlEmail(event),
                  },
                });
              }
            } catch (error) {
              this.logger.warn(
                `Promoted user ${
                  nextGoing.userId
                } from the waitlist on event ${eventId}, but the notification email failed: ${
                  error instanceof Error ? error.message : error
                }`,
              );
            }
          }
          return registration;
        } else if (
          regStatus === RegStatus.NOT_GOING &&
          existingReg.regStatus === RegStatus.WAITLISTED
        ) {
          return trx.registration.update({
            where: {
              eventId_userId: {
                eventId: eventId,
                userId,
              },
            },
            data: {
              regStatus: regStatus,
              formAnswer: null,
            },
          });
        }
      } else {
        throw new ForeignKeyNotFoundException(eventId, userId);
      }
    });
  }
}
