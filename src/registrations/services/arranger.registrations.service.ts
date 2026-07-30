import { BadRequestException, Injectable } from "@nestjs/common";
import {
  Event,
  EventVisibility,
  RegStatus,
} from "../../generated/prisma/client";
import {
  SearchEventRegistrationDto,
  SearchEventRegistrationCountDto,
} from "../../events/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { CommonRegistrationService } from "./common.registrations.service";
import { Registration } from "../../generated/prisma/client";
import { EventNotFoundException } from "../../events/exceptions";
import { escapeHtml } from "../../util/html";
import { ArrangerUpdateRegistrationDto } from "../dto";
import { AzureCommunicationService } from "../../azure/azure-communication.service";
import { UserDoesNotExistException } from "../../users/exceptions";
import { EmailRecipients } from "@azure/communication-email";

@Injectable()
export class ArrangerRegistrationService extends CommonRegistrationService {
  constructor(
    prismaService: PrismaService,
    azureCommunicationService: AzureCommunicationService,
  ) {
    super(prismaService, azureCommunicationService);
  }

  async findAll(
    searchProps: SearchEventRegistrationDto,
    eventId: string,
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
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              image: true,
              foodPreference:
                searchProps.regStatus === RegStatus.GOING && eventHasFood,
              userAllergens:
                searchProps.regStatus === RegStatus.GOING && eventHasFood
                  ? {
                      select: { allergen: true },
                    }
                  : undefined,
            },
          },
        },
      });
    }

    const registrations = await this.prismaService.registration.findMany({
      skip,
      take,
      where: { eventId: eventId },
      orderBy: { [orderBy]: orderDirection },
      include: {
        user: new Boolean(searchProps.includeUsers).valueOf()
          ? {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                image: true,
                foodPreference: eventHasFood,
                userAllergens: eventHasFood
                  ? { select: { allergen: true } }
                  : undefined,
              },
            }
          : undefined,
      },
    });

    // remove foodPreference if not going
    return eventHasFood
      ? registrations.map((registration) => {
          if (registration.regStatus !== RegStatus.GOING) {
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

    const toEmails: EmailRecipients = { to: [{ email: user.email }] };

    const updated = await super.updateRegistration(
      userId,
      eventId,
      regStatus.regStatus,
    );

    if (user.allowEmailFromArranger) {
      switch (regStatus.regStatus) {
        case RegStatus.NOT_GOING:
          await this.azureCommunicationService.send({
            sender: "no-reply@peoply.app",
            recipients: toEmails,
            content: {
              subject: `Peoply: Du har blitt avmeldt "${event.title}"`,
              html: this.buildEventUnregisterHtmlEmail(event),
            },
          });
          break;

        case RegStatus.BANNED:
          await this.azureCommunicationService.send({
            sender: "no-reply@peoply.app",
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
    const urlId = escapeHtml(event.urlId);

    return (
      `<h1>Du har blitt avmeldt fra ${title}</h1>\n` +
      `<p>Arrangøren har meldt deg av arrangementet, og du må melde deg på nytt hvis de skal være påmeldt. Da kan det være du havner på venteliste.</p>\n` +
      `<div style="border-bottom: 1px dashed #000; margin: 1rem 0; width: 100%;"></div>\n` +
      "<p>" +
      `Du mottar denne e-posten fordi du var påmeldt <a href="https://peoply.app/events/${urlId}" target="_blank">"${title}"</a> på Peoply.\n` +
      "</p>" +
      "<p>" +
      `Hvis du ikke vil motta slike e-poster fra arrangøren, kan du endre dette i <a href="https://peoply.app/me/settings" target="_blank">dine innstillinger</a>` +
      "</p>"
    );
  }

  private buildEventBannedHtmlEmail(event: Partial<Event>) {
    const title = escapeHtml(event.title);
    const urlId = escapeHtml(event.urlId);

    return (
      `<h1>Du har blitt utestengt fra ${title}</h1>\n` +
      `<p>Arrangøren har utestengt deg fra arrangementet, og du kan ikke melde deg på på nytt.</p>\n` +
      `<div style="border-bottom: 1px dashed #000; margin: 1rem 0; width: 100%;"></div>\n` +
      "<p>" +
      `Du mottar denne e-posten fordi du var påmeldt <a href="https://peoply.app/events/${urlId}" target="_blank">"${title}"</a> på Peoply.\n` +
      "</p>" +
      "<p>" +
      `Hvis du ikke vil motta slike e-poster fra arrangøren, kan du endre dette i <a href="https://peoply.app/me/settings" target="_blank">dine innstillinger</a>` +
      "</p>"
    );
  }
}
