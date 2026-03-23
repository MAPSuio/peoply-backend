import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";
import { EventArrangerRole, EventVisibility } from ".prisma/client";
import { PrismaError } from "../prisma/prisma.constants";
import { CreateEventDto, SearchEventDto, UpdateEventDto } from "./dto";
import { ArrangerNotFoundException } from "../arrangers/exceptions";
import { EventNotFoundException } from "./exceptions";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { ArrangersService } from "../arrangers/services";
import { Event } from ".prisma/client";
import { calculateEditDistance } from "../util/string";
import { EventUpdateVisibility, RegStatus } from "@prisma/client";
import { EmailRecipients } from "@azure/communication-email";
import { SendUpdateDto } from "./dto/send-update.dto";
import { AzureCommunicationService } from "../azure/azure-communication.service";
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arrangersService: ArrangersService,
    private readonly azureStorageService: AzureStorageService,
    private readonly azureCommunicationService: AzureCommunicationService,
  ) {}

  async create(
    createEventDto: CreateEventDto,
    arrangerId: string,
    eventImage?: Express.Multer.File,
  ) {
    const arranger = await this.arrangersService.findOne(arrangerId);
    if (!arranger) {
      throw new ArrangerNotFoundException(arrangerId);
    }

    const eventId = uuidv4();
    const eventImageFileName = `${eventId}.${
      eventImage?.mimetype.split("/")[1]
    }`;

    try {
      const imageUrl = eventImage
        ? await this.azureStorageService.upload(
            eventImageFileName,
            eventImage.buffer,
            AzureStorageContainer.EVENT_IMAGES,
          )
        : null;

      const event = await this.prisma.$transaction(async (trx) => {
        let existingEvent: Event | null;
        let urlId: string;
        let counter = 0;

        /* Make sure the URL id is unique
         * If not, generate a new one and try again 3 times
         */
        do {
          urlId = this.generateUrlId();
          existingEvent = await trx.event.findUnique({
            where: { urlId: urlId },
          });
        } while (existingEvent && ++counter < 3);

        if (counter === 3 && existingEvent) {
          throw new Error("Could not generate urlId");
        }

        const event = await trx.event.create({
          data: {
            id: eventId,
            urlId,
            description: createEventDto.description,
            title: createEventDto.title,
            startDate: createEventDto.startDate,
            endDate: createEventDto.endDate,
            regStart: createEventDto.regStart,
            regEnd: createEventDto.regEnd,
            capacity: createEventDto.capacity,
            visibility: createEventDto.visibility,
            hasFood: createEventDto.hasFood,
            formQuestion: createEventDto.formQuestion,
            image: imageUrl,
            locationName: createEventDto.locationName,
            country: createEventDto.country,
            countryCode: createEventDto.countryCode,
            countryCodeISO3: createEventDto.countryCodeISO3,
            freeformAddress: createEventDto.freeformAddress,
            latitude: createEventDto.latitude,
            longitude: createEventDto.longitude,
            localName: createEventDto.localName,
            postalCode: createEventDto.postalCode,
            municipality: createEventDto.municipality,
            poiName: createEventDto.poiName,
            countrySubdivision: createEventDto.countrySubdivision,
            streetName: createEventDto.streetName,
            streetNumber: createEventDto.streetNumber,
          },
        });
        await trx.eventArranger.create({
          data: {
            role: EventArrangerRole.ADMIN,
            arrangerId,
            eventId,
          },
        });
        await trx.eventCategory.createMany({
          data: createEventDto.categoryIds.map((categoryId) => ({
            categoryId,
            eventId,
          })),
        });

        return event;
      });
      return event;
    } catch (error) {
      try {
        if (eventImage) {
          await this.azureStorageService.delete(
            eventImageFileName,
            AzureStorageContainer.EVENT_IMAGES,
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(error, "Could not delete event image");
      }
      if (error instanceof PrismaClientKnownRequestError) {
        switch (error.code) {
          case PrismaError.ForeignKeyFailed:
            /* bad category id */
            throw new BadRequestException("Bad category id");

          case PrismaError.DuplicateUniqueValue:
            throw new BadRequestException(
              "Duplicate event id, or duplicates in categoryIds",
            );
          default:
            throw error;
        }
      } else {
        throw error;
      }
    }
  }

  async findAll(
    searchProps: SearchEventDto = {},
    skip = 0,
    take = 10,
    orderBy = "startDate",
    orderDirection = "asc",
  ) {
    const generateSearchQuery = (name: string) =>
      name.toLowerCase().split(" ").join(" & ");

    const events = await this.prisma.event.findMany({
      skip,
      take,
      where: {
        urlId: searchProps.urlId,
        startDate: {
          gte: searchProps.afterDate,
          lte: searchProps.beforeDate,
        },
        title: searchProps.title
          ? { contains: searchProps.title, mode: "insensitive" }
          : undefined,
        description: searchProps.description
          ? { search: generateSearchQuery(searchProps.description) }
          : undefined,
        capacity: searchProps.capacity,
        archivedAt: null,
        visibility: EventVisibility.PUBLIC,

        eventCategories: searchProps.categoryIds
          ? {
              some: {
                categoryId: { in: searchProps.categoryIds },
              },
            }
          : undefined,

        // If arrangerIds is provided, we should only return events with those arrangers.
        // If not specified, but userId is, we should only return events with that user as an arranger.
        // If not specified, but organizationId is, we should only return events with that organization as an arranger.
        eventArrangers: searchProps.arrangerIds
          ? {
              some: {
                arrangerId: { in: searchProps.arrangerIds },
              },
            }
          : {
              every: {
                arranger: {
                  user: searchProps.userId
                    ? { id: searchProps.userId }
                    : undefined,
                  organization: searchProps.organizationId
                    ? {
                        id: searchProps.organizationId,
                      }
                    : undefined,
                },
              },
            },
        featured: searchProps.featured,
      },
      include: {
        eventArrangers: {
          include: {
            arranger: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    image: true,
                  },
                },
                organization: {
                  select: {
                    id: true,
                    urlId: true,
                    name: true,
                    image: true,
                    orgNr: true,
                  },
                },
              },
            },
          },
        },
        eventCategories: {
          select: { category: { select: { name: true } } },
        },
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });

    if (searchProps.title) {
      return events
        .map((event) => {
          const titleEditDistance = calculateEditDistance(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            searchProps.title!,
            event.title,
          );
          return {
            event,
            titleEditDistance,
          };
        })
        .sort((a, b) => a.titleEditDistance - b.titleEditDistance)
        .map((event) => event.event);
    }
    return events;
  }

  async findOne(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    return event?.archivedAt ? null : event;
  }

  async findOneByUrlId(urlId: string) {
    const event = await this.prisma.event.findUnique({
      where: { urlId: urlId },
      include: {
        eventArrangers: {
          include: {
            arranger: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    id: true,
                    image: true,
                  },
                },
                organization: {
                  select: {
                    id: true,
                    urlId: true,
                    name: true,
                    image: true,
                    orgNr: true,
                  },
                },
              },
            },
          },
        },
        eventCategories: {
          include: {
            category: true,
          },
        },
        registrations: {
          select: { regStatus: true },
        },
      },
    });

    if (!event || event.archivedAt) {
      throw new EventNotFoundException(urlId);
    } else {
      return event;
    }
  }

  async findOneVisibleToUser(
    eventId: string,
    userId?: string,
    isArranger = false,
  ) {
    const event = await this.findOne(eventId);

    if (
      !event ||
      !(await this.canViewEvent(event.id, event.visibility, userId, isArranger))
    ) {
      throw new EventNotFoundException(eventId);
    }

    return event;
  }

  async findOneByUrlIdVisibleToUser(
    urlId: string,
    userId?: string,
    isArranger = false,
  ) {
    const event = await this.findOneByUrlId(urlId);

    if (
      !(await this.canViewEvent(event.id, event.visibility, userId, isArranger))
    ) {
      throw new EventNotFoundException(urlId);
    }

    return event;
  }

  async findOneWithArrangers(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: id },
      include: {
        eventArrangers: true,
      },
    });

    if (!event || event.archivedAt) {
      throw new EventNotFoundException(id);
    } else {
      return event;
    }
  }

  async findOneWithArrangersByUrlId(urlId: string) {
    const event = await this.prisma.event.findUnique({
      where: { urlId: urlId },
      include: {
        eventArrangers: true,
      },
    });

    if (!event || event.archivedAt) {
      throw new EventNotFoundException(urlId);
    } else {
      return event;
    }
  }

  async update(
    updateEventDto: UpdateEventDto,
    id: string,
    newImage?: Express.Multer.File,
  ) {
    const { categoryIds, ...rest } = updateEventDto;

    let newImageUrl: string | null = null;
    let deleteImage = updateEventDto.deleteImage;

    try {
      // get event
      const oldEvent = await this.prisma.event.findUnique({
        where: { id },
      });

      if (!oldEvent) {
        throw new EventNotFoundException(id);
      }

      if (oldEvent.readOnly) {
        throw new BadRequestException(
          "Imported ICS events can not be edited manually",
        );
      }

      if (newImage) {
        //upload new image
        newImageUrl = await this.azureStorageService.upload(
          this.azureStorageService.generateFileNameById(oldEvent.id, newImage),
          newImage.buffer,
          AzureStorageContainer.EVENT_IMAGES,
        );

        deleteImage = false;
      }
      delete rest.deleteImage;

      return await this.prisma.$transaction(async (trx) => {
        // update event
        const event = await trx.event.update({
          where: { id },
          data: {
            image: newImageUrl ?? oldEvent.image,
            ...rest,
          },
        });

        //update categories if specified
        if (categoryIds) {
          const oldCategories = await trx.eventCategory.findMany({
            where: { eventId: event.id },
          });

          const oldCategoriesId = oldCategories.map(
            (category) => category.categoryId,
          );

          const toDelete = oldCategoriesId.filter(
            (id) => !categoryIds.includes(id),
          );
          const toAdd = categoryIds.filter(
            (id) => !oldCategoriesId.includes(id),
          );

          await trx.eventCategory.deleteMany({
            where: {
              categoryId: {
                in: toDelete,
              },
              eventId: event.id,
            },
          });

          await trx.eventCategory.createMany({
            data: toAdd.map((categoryId) => ({
              categoryId,
              eventId: event.id,
            })),
          });
        }

        //delete existing image if it exists
        if (oldEvent.image && (deleteImage || newImage)) {
          const imageName = oldEvent.image.slice(
            oldEvent.image.lastIndexOf("/") + 1,
          );
          await this.azureStorageService.delete(
            imageName,
            AzureStorageContainer.EVENT_IMAGES,
          );

          if (deleteImage && !newImage) {
            await trx.event.update({
              where: { id },
              data: { image: null },
            });
          }
        }
        return event;
      });
    } catch (error) {
      //delete uploaded image if there was an error
      if (newImageUrl) {
        await this.azureStorageService.delete(
          newImageUrl.slice(newImageUrl.lastIndexOf("/") + 1),
          AzureStorageContainer.EVENT_IMAGES,
        );
      }

      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(id);
      } else {
        throw error;
      }
    }
  }

  async remove(id: string) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id },
        select: { readOnly: true },
      });

      if (event?.readOnly) {
        throw new BadRequestException(
          "Imported ICS events can not be deleted manually",
        );
      }

      return await this.prisma.event.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(id);
      } else {
        throw error;
      }
    }
  }

  async sendUpdateToEventParticipants(
    createdByUserId: string,
    eventId: string,
    updateDto: SendUpdateDto,
  ): Promise<void> {
    const event = await this.findOneWithArrangers(eventId);

    if (!event) {
      throw new EventNotFoundException(eventId);
    }

    let azureMessageId: string | null = null;

    if (updateDto.sendEmail) {
      // get all exisitng updates within the last 24 hours
      const existingUpdates = await this.prisma.eventUpdate.findMany({
        where: {
          eventId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
          sendEmail: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const allowedToSendEmail = existingUpdates.length < 5;

      if (!allowedToSendEmail) {
        throw new HttpException(
          "Too many updates sent",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const registrations = (
        await this.prisma.registration.findMany({
          where: { eventId, regStatus: RegStatus.GOING },
          include: {
            user: true,
          },
        })
      ).filter(({ user }) => user.allowEmailFromArranger);

      const toEmails: EmailRecipients = {
        to: [{ email: "no-reply@peoply.app" }],
        bCC: registrations.map(({ user }) => ({
          email: user.email,
        })),
      };

      if (toEmails.to.length > 0) {
        const { messageId } = await this.azureCommunicationService.send({
          sender: "no-reply@peoply.app",
          recipients: toEmails,
          content: {
            subject: `Peoply: Oppdatering for "${event.title}"`,
            html: this.buildEventUpdateHtmlEmail(updateDto, event),
          },
          replyTo: updateDto.replyTo
            ? [{ email: updateDto.replyTo }]
            : undefined,
        });
        azureMessageId = messageId;
      }
    }

    await this.prisma.eventUpdate.create({
      data: {
        eventId,
        body: updateDto.body,
        subject: updateDto.subject,
        replyTo: updateDto.replyTo,
        azureMessageId: azureMessageId,
        sendEmail: updateDto.sendEmail,
        visibility: updateDto.visibility,
        createdByUserId,
      },
    });
  }

  async getUpdatesForEvent(
    eventId: string,
    userId?: string,
    isArranger?: boolean,
  ) {
    if (userId) {
      // if user is GOING or arranger, show all updates
      const registration = await this.prisma.registration.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (registration?.regStatus === RegStatus.GOING || isArranger) {
        return await this.prisma.eventUpdate.findMany({
          where: {
            eventId,
            visibility: {
              not: EventUpdateVisibility.DELETED,
            },
          },
          select: {
            id: true,
            visibility: true,
            eventId: true,
            sendEmail: true,
            subject: true,
            body: true,
            replyTo: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }
    }
    return await this.prisma.eventUpdate.findMany({
      where: { eventId, visibility: EventUpdateVisibility.ALL },
      select: {
        id: true,
        visibility: true,
        subject: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async canViewEvent(
    eventId: string,
    visibility: EventVisibility,
    userId?: string,
    isArranger = false,
  ) {
    if (visibility === EventVisibility.PUBLIC) {
      return true;
    }

    if (!userId) {
      return false;
    }

    if (isArranger) {
      return true;
    }

    const registration = await this.prisma.registration.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      select: {
        regStatus: true,
      },
    });

    return (
      registration?.regStatus === RegStatus.INVITED ||
      registration?.regStatus === RegStatus.GOING ||
      registration?.regStatus === RegStatus.WAITLISTED
    );
  }

  async deleteUpdateForEvent(updateId: string) {
    return await this.prisma.eventUpdate.update({
      where: { id: updateId },
      data: { visibility: EventUpdateVisibility.DELETED },
    });
  }

  private generateUrlId() {
    const ID_LENGTH = 8;
    /* Generate a random string of 10 letters from A to Z */
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let urlId = "";
    for (let i = 0; i < ID_LENGTH; i++) {
      urlId += letters.charAt(Math.floor(Math.random() * letters.length));
    }

    return urlId;
  }

  private buildEventUpdateHtmlEmail(updateDto: SendUpdateDto, event: Event) {
    return (
      `<h1>${updateDto.subject}</h1>\n` +
      `${updateDto.body
        .split("\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}\n` +
      `<div style="border-bottom: 1px dashed #000; margin: 1rem 0; width: 100%;"></div>\n` +
      `<p>
      ${
        updateDto.replyTo
          ? "Svar på denne mailen eller send mail til e-posten under for å sende svar til arrangøren.\n" +
            "<br>" +
            `<a href="mailto:${updateDto.replyTo}?subject=SV: ${updateDto.subject}">${updateDto.replyTo}</a>`
          : ""
      }
    </p>` +
      "<p>" +
      `Du mottar denne e-posten fordi du har meldt deg på <a href="https://peoply.app/events/${event.urlId}" target="_blank">"${event.title}"</a> på Peoply.\n` +
      "</p>" +
      "<p>" +
      `Hvis du ikke vil motta slike e-poster fra arrangøren, kan du endre dette i <a href="https://peoply.app/me/settings" target="_blank">dine innstillinger</a>` +
      "</p>"
    );
  }
}
