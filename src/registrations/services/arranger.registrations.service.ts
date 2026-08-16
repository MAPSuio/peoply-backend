import { Injectable } from "@nestjs/common";
import {
  Event,
  EventVisibility,
  RegStatus,
} from "../../generated/prisma/client";
import {
  SearchEventRegistrationDto,
  SearchEventRegistrationCountDto,
} from "../../events/dto";
import { CommonRegistrationService } from "./common.registrations.service";
import { EventNotFoundException } from "../../events/exceptions";
import { escapeHtml } from "../../util/html";
import { ArrangerUpdateRegistrationDto } from "../dto";
import { UserDoesNotExistException } from "../../users/exceptions";
import { EmailRecipients } from "@azure/communication-email";
import { EMAIL_DIVIDER, eventEmailFooter } from "../../util/email";
import { PUBLIC_USER_SELECT } from "../../users/user.select";

/**
 * The attendee row an arranger sees. Food fields ride along only when the
 * event serves food and the registration entitles the user to it.
 */
const attendeeSelect = (showFood: boolean | undefined) => ({
  select: {
    ...PUBLIC_USER_SELECT,
    foodPreference: !!showFood,
    userAllergens: showFood ? { select: { allergen: true } } : undefined,
  },
});

@Injectable()
export class ArrangerRegistrationService extends CommonRegistrationService {
  async findAll(searchProps: SearchEventRegistrationDto, eventId: string) {
    const {
      skip = 0,
      take = 10,
      orderBy = "updatedAt",
      orderDirection = "asc",
    } = searchProps;

    const eventHasFood = (
      await this.prismaService.event.findUnique({
        where: { id: eventId },
        select: { hasFood: true },
      })
    )?.hasFood;

    if (searchProps.regStatus) {
      return await this.prismaService.registration.findMany({
        where: { eventId: eventId, regStatus: searchProps.regStatus },
        skip,
        take,
        orderBy: { [orderBy]: orderDirection },
        include: {
          user: attendeeSelect(
            searchProps.regStatus === RegStatus.GOING && eventHasFood,
          ),
        },
      });
    }

    const registrations = await this.prismaService.registration.findMany({
      skip,
      take,
      where: { eventId: eventId },
      orderBy: { [orderBy]: orderDirection },
      include: {
        user: searchProps.includeUsers
          ? attendeeSelect(eventHasFood)
          : undefined,
      },
    });

    // remove foodPreference if not going
    //
    // `user` is only included when includeUsers is set, so without it there is
    // nothing to redact - and dereferencing it threw a TypeError, i.e. a 500 on
    // the default shape of this request for any event that serves food.
    return eventHasFood
      ? registrations.map((registration) => {
          if (registration.user && registration.regStatus !== RegStatus.GOING) {
            registration.user.foodPreference = null;
            // @ts-expect-error
            registration.user.userAllergens = [];
          }
          return registration;
        })
      : registrations;
  }

  async getRegistrationCount(
    searchProps: SearchEventRegistrationCountDto,
    eventId: string,
    isArranger = false,
  ) {
    const event = await this.prismaService.event.findUnique({
      where: { id: eventId },
      select: { visibility: true },
    });

    // findUnique returns null rather than raising, so the not-found case is
    // still checked here — the filter only covers errors Prisma throws.
    if (!event) {
      throw new EventNotFoundException(eventId);
    }

    if (!isArranger && event.visibility !== EventVisibility.PUBLIC) {
      throw new EventNotFoundException(eventId);
    }

    return await this.prismaService.registration.count({
      where: searchProps.regStatus
        ? { eventId: eventId, regStatus: searchProps.regStatus }
        : { eventId: eventId },
    });
  }

  async update(
    userId: string,
    eventId: string,
    regStatus: ArrangerUpdateRegistrationDto,
  ) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { email: true, allowEmailFromArranger: true },
    });

    const event = await this.prismaService.event.findUnique({
      where: { id: eventId },
      select: { title: true, urlId: true },
    });

    if (!event) {
      throw new EventNotFoundException(eventId);
    }

    if (!user) {
      throw new UserDoesNotExistException(userId);
    }

    const toEmails: EmailRecipients = { to: [{ address: user.email }] };

    const updated = await super.updateRegistration(
      userId,
      eventId,
      regStatus.regStatus,
    );

    /* `updated` is undefined when no status branch matched - the transaction
       wrote nothing and threw nothing. Mailing on that turned this endpoint
       into a targeted email sender: an arranger who invites someone (which
       force-creates their registration) can then PATCH them to a status they
       already hold, over and over, and every call sends real mail from
       no-reply@peoply.app to that person. Only announce a change that
       happened. */
    if (updated && user.allowEmailFromArranger) {
      switch (regStatus.regStatus) {
        case RegStatus.NOT_GOING:
          await this.azureCommunicationService.send({
            senderAddress: "no-reply@peoply.app",
            recipients: toEmails,
            content: {
              subject: `Peoply: Du har blitt avmeldt "${event.title}"`,
              html: this.buildEventUnregisterHtmlEmail(event),
            },
          });
          break;

        case RegStatus.BANNED:
          await this.azureCommunicationService.send({
            senderAddress: "no-reply@peoply.app",
            recipients: toEmails,
            content: {
              subject: `Peoply: Du har blitt utestengt fra "${event.title}"`,
              html: this.buildEventBannedHtmlEmail(event),
            },
          });
          break;

        default:
          break;
      }
    }
    return updated;
  }

  private buildEventUnregisterHtmlEmail(event: Partial<Event>) {
    const title = escapeHtml(event.title);

    return (
      `<h1>Du har blitt avmeldt fra ${title}</h1>\n` +
      `<p>Arrangøren har meldt deg av arrangementet, og du må melde deg på nytt hvis de skal være påmeldt. Da kan det være du havner på venteliste.</p>\n` +
      EMAIL_DIVIDER +
      eventEmailFooter(event, { pastTense: true })
    );
  }

  private buildEventBannedHtmlEmail(event: Partial<Event>) {
    const title = escapeHtml(event.title);

    return (
      `<h1>Du har blitt utestengt fra ${title}</h1>\n` +
      `<p>Arrangøren har utestengt deg fra arrangementet, og du kan ikke melde deg på på nytt.</p>\n` +
      EMAIL_DIVIDER +
      eventEmailFooter(event, { pastTense: true })
    );
  }
}
