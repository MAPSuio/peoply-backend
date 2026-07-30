import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventArrangerRole, EventVisibility } from "../generated/prisma/client";
import { CreateEventDto, SearchEventDto, UpdateEventDto } from "./dto";
import { ArrangerNotFoundException } from "../arrangers/exceptions";
import { PUBLIC_ARRANGER_INCLUDE } from "../arrangers/arranger.select";
import {
  EventNotFoundException,
  EventUpdateNotFoundException,
} from "./exceptions";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { ArrangersService } from "../arrangers/services";
import { Event } from "../generated/prisma/client";
import { calculateEditDistance } from "../util/string";
import { buildDescriptionSearchQuery } from "../util/search";
import {
  EventRegistrationMode,
  EventUpdateVisibility,
  RegStatus,
} from "../generated/prisma/client";
import { EmailRecipients } from "@azure/communication-email";
import { SendUpdateDto } from "./dto/send-update.dto";
import { AzureCommunicationService } from "../azure/azure-communication.service";
import { createUuid } from "../util/uuid";
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arrangersService: ArrangersService,
    private readonly azureStorageService: AzureStorageService,
    private readonly azureCommunicationService: AzureCommunicationService,
  ) {}

  private normalizeCreateRegistrationData(createEventDto: CreateEventDto) {
    const registrationMode =
      createEventDto.registrationMode ?? EventRegistrationMode.PEOPLY;
    const externalUrl = createEventDto.externalUrl?.trim() || null;

    if (registrationMode === EventRegistrationMode.EXTERNAL && !externalUrl) {
      throw new BadRequestException(
        "External URL is required when registration mode is EXTERNAL",
      );
    }

    return {
      ...createEventDto,
      registrationMode,
      externalUrl:
        registrationMode === EventRegistrationMode.EXTERNAL
          ? externalUrl
          : null,
    };
  }

  private normalizeUpdateRegistrationData(
    oldEvent: Event,
    updateEventData: Omit<UpdateEventDto, "categoryIds">,
  ) {
    const normalizedEventData: Omit<
      UpdateEventDto,
      "categoryIds" | "externalUrl"
    > & {
      externalUrl?: string | null;
    } = { ...updateEventData };
    const nextRegistrationMode =
      normalizedEventData.registrationMode ?? oldEvent.registrationMode;
    const nextExternalUrl =
      typeof normalizedEventData.externalUrl === "string"
        ? normalizedEventData.externalUrl.trim() || null
        : oldEvent.externalUrl;

    if (
      nextRegistrationMode === EventRegistrationMode.EXTERNAL &&
      !nextExternalUrl
    ) {
      throw new BadRequestException(
        "External URL is required when registration mode is EXTERNAL",
      );
    }

    if (normalizedEventData.registrationMode) {
      normalizedEventData.externalUrl =
        normalizedEventData.registrationMode === EventRegistrationMode.EXTERNAL
          ? nextExternalUrl
          : null;
    } else if (typeof normalizedEventData.externalUrl === "string") {
      normalizedEventData.externalUrl =
        nextRegistrationMode === EventRegistrationMode.EXTERNAL
          ? nextExternalUrl
          : null;
    }

    return normalizedEventData;
  }

  private async resolveCoOrganizerArrangerIds(
    organizationIds: string[] | undefined,
    primaryArrangerId?: string,
    prismaClient: Pick<PrismaService, "organization"> = this.prisma,
  ) {
    const uniqueOrganizationIds = [...new Set(organizationIds ?? [])];

    if (uniqueOrganizationIds.length === 0) {
      return [];
    }

    const organizations = await prismaClient.organization.findMany({
      where: {
        id: {
          in: uniqueOrganizationIds,
        },
      },
      select: {
        id: true,
        arrangerId: true,
      },
    });

    if (organizations.length !== uniqueOrganizationIds.length) {
      throw new BadRequestException("Invalid co-organizer organization id");
    }

    const organizationArrangerIds = new Map(
      organizations.map((organization) => [
        organization.id,
        organization.arrangerId,
      ]),
    );

    const missingArrangerOrganizationIds = uniqueOrganizationIds.filter(
      (organizationId) => !organizationArrangerIds.get(organizationId),
    );

    if (missingArrangerOrganizationIds.length > 0) {
      throw new BadRequestException(
        `Organization missing arrangerId: ${missingArrangerOrganizationIds.join(
          ", ",
        )}`,
      );
    }

    return uniqueOrganizationIds
      .map((organizationId) => organizationArrangerIds.get(organizationId))
      .filter(
        (arrangerId): arrangerId is string => arrangerId !== primaryArrangerId,
      );
  }

  private async syncCoOrganizers(
    eventId: string,
    collaboratorArrangerIds: string[],
    trx: Pick<PrismaService, "eventArranger">,
  ) {
    await trx.eventArranger.deleteMany({
      where: {
        eventId,
        role: EventArrangerRole.COLLABORATOR,
      },
    });

    if (collaboratorArrangerIds.length === 0) {
      return;
    }

    await trx.eventArranger.createMany({
      data: collaboratorArrangerIds.map((arrangerId) => ({
        eventId,
        arrangerId,
        role: EventArrangerRole.COLLABORATOR,
      })),
    });
  }

  async create(
    createEventDto: CreateEventDto,
    arrangerId: string,
    eventImage?: Express.Multer.File,
  ) {
    const normalizedCreateEventDto =
      this.normalizeCreateRegistrationData(createEventDto);
    const arranger = await this.arrangersService.findOne(arrangerId);
    if (!arranger) {
      throw new ArrangerNotFoundException(arrangerId);
    }

    const collaboratorArrangerIds = await this.resolveCoOrganizerArrangerIds(
      normalizedCreateEventDto.coOrganizerOrganizationIds,
      arrangerId,
    );

    const eventId = createUuid();
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
            description: normalizedCreateEventDto.description,
            title: normalizedCreateEventDto.title,
            startDate: normalizedCreateEventDto.startDate,
            endDate: normalizedCreateEventDto.endDate,
            regStart: normalizedCreateEventDto.regStart,
            regEnd: normalizedCreateEventDto.regEnd,
            capacity: normalizedCreateEventDto.capacity,
            visibility: normalizedCreateEventDto.visibility,
            hasFood: normalizedCreateEventDto.hasFood,
            registrationMode: normalizedCreateEventDto.registrationMode,
            externalUrl: normalizedCreateEventDto.externalUrl,
            formQuestion: normalizedCreateEventDto.formQuestion,
            image: imageUrl,
            locationName: normalizedCreateEventDto.locationName,
            country: normalizedCreateEventDto.country,
            countryCode: normalizedCreateEventDto.countryCode,
            countryCodeISO3: normalizedCreateEventDto.countryCodeISO3,
            freeformAddress: normalizedCreateEventDto.freeformAddress,
            latitude: normalizedCreateEventDto.latitude,
            longitude: normalizedCreateEventDto.longitude,
            localName: normalizedCreateEventDto.localName,
            postalCode: normalizedCreateEventDto.postalCode,
            municipality: normalizedCreateEventDto.municipality,
            poiName: normalizedCreateEventDto.poiName,
            countrySubdivision: normalizedCreateEventDto.countrySubdivision,
            streetName: normalizedCreateEventDto.streetName,
            streetNumber: normalizedCreateEventDto.streetNumber,
          },
        });
        await trx.eventArranger.createMany({
          data: [
            {
              role: EventArrangerRole.ADMIN,
              arrangerId,
              eventId,
            },
            ...collaboratorArrangerIds.map((collaboratorArrangerId) => ({
              role: EventArrangerRole.COLLABORATOR,
              arrangerId: collaboratorArrangerId,
              eventId,
            })),
          ],
        });
        await trx.eventCategory.createMany({
          data: normalizedCreateEventDto.categoryIds.map((categoryId) => ({
            categoryId,
            eventId,
          })),
        });

        return event;
      });
      return event;
    } catch (error) {
      // This catch stays: the image is uploaded before the transaction runs,
      // so a failed transaction would otherwise orphan it in blob storage.
      // The Prisma code mapping that used to live here is gone —
      // PrismaExceptionFilter turns P2003 into 400 and P2002 into 409.
      try {
        if (eventImage) {
          await this.azureStorageService.delete(
            eventImageFileName,
            AzureStorageContainer.EVENT_IMAGES,
          );
        }
      } catch (cleanupError) {
        this.logger.warn(
          `Event creation failed and the uploaded image ${eventImageFileName} could not be removed: ${
            cleanupError instanceof Error ? cleanupError.message : cleanupError
          }`,
        );
      }
      throw error;
    }
  }

  async findAll(
    searchProps: SearchEventDto = {},
    skip = 0,
    take = 10,
    orderBy = "startDate",
    orderDirection = "asc",
  ) {
    const descriptionSearch = searchProps.description
      ? buildDescriptionSearchQuery(searchProps.description)
      : undefined;

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
        description: descriptionSearch
          ? { search: descriptionSearch }
          : undefined,
        capacity: searchProps.capacity,
        archivedAt: null,
        visibility: EventVisibility.PUBLIC,
        AND: [
          {
            eventArrangers: {
              none: {
                arranger: {
                  organization: {
                    is: {
                      approved: false,
                    },
                  },
                },
              },
            },
          },
        ],

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
          : searchProps.userId
            ? {
                some: {
                  arranger: {
                    user: {
                      id: searchProps.userId,
                    },
                  },
                },
              }
            : searchProps.organizationId
              ? {
                  some: {
                    arranger: {
                      organization: {
                        id: searchProps.organizationId,
                      },
                    },
                  },
                }
              : undefined,
        featured: searchProps.featured,
      },
      include: {
        eventArrangers: {
          include: {
            arranger: {
              include: PUBLIC_ARRANGER_INCLUDE,
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
              include: PUBLIC_ARRANGER_INCLUDE,
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
    const { categoryIds, coOrganizerOrganizationIds, ...rest } = updateEventDto;

    let newImageUrl: string | null = null;
    let deleteImage = updateEventDto.deleteImage;

    try {
      // get event
      const oldEvent = await this.prisma.event.findUnique({
        where: { id },
        include: {
          eventArrangers: true,
        },
      });

      if (!oldEvent) {
        throw new EventNotFoundException(id);
      }

      if (oldEvent.readOnly) {
        throw new BadRequestException(
          "Imported ICS events can not be edited manually",
        );
      }

      if (
        typeof updateEventDto.capacity === "number" &&
        updateEventDto.capacity > 0
      ) {
        const goingCount = await this.prisma.registration.count({
          where: {
            eventId: id,
            regStatus: RegStatus.GOING,
          },
        });

        if (updateEventDto.capacity < goingCount) {
          throw new BadRequestException(
            `Capacity can not be lower than the ${goingCount} registered attendees`,
          );
        }
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
      const normalizedRest = this.normalizeUpdateRegistrationData(
        oldEvent,
        rest,
      );

      const primaryArrangerId =
        oldEvent.eventArrangers.find(
          (eventArranger) => eventArranger.role === EventArrangerRole.ADMIN,
        )?.arrangerId ?? oldEvent.eventArrangers[0]?.arrangerId;

      if (!primaryArrangerId) {
        throw new BadRequestException("Event must have at least one arranger");
      }

      return await this.prisma.$transaction(async (trx) => {
        // update event
        const event = await trx.event.update({
          where: { id },
          data: {
            image: newImageUrl ?? oldEvent.image,
            ...normalizedRest,
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

        if (coOrganizerOrganizationIds !== undefined) {
          const collaboratorArrangerIds =
            await this.resolveCoOrganizerArrangerIds(
              coOrganizerOrganizationIds,
              primaryArrangerId,
              trx,
            );

          await this.syncCoOrganizers(event.id, collaboratorArrangerIds, trx);
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
      // Kept for the cleanup only: the replacement image is uploaded before
      // the transaction, so a failure would leave it orphaned. The cleanup is
      // now guarded — an unguarded delete that threw replaced the real error
      // with the storage error and hid why the update failed.
      if (newImageUrl) {
        try {
          await this.azureStorageService.delete(
            newImageUrl.slice(newImageUrl.lastIndexOf("/") + 1),
            AzureStorageContainer.EVENT_IMAGES,
          );
        } catch (cleanupError) {
          this.logger.warn(
            `Event ${id} update failed and the uploaded image could not be removed: ${
              cleanupError instanceof Error
                ? cleanupError.message
                : cleanupError
            }`,
          );
        }
      }

      throw error;
    }
  }

  async remove(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: { readOnly: true },
    });

    if (event?.readOnly) {
      throw new BadRequestException(
        "Imported ICS events can not be deleted manually",
      );
    }

    // A missing event raises P2025, which becomes 404 in the filter.
    return await this.prisma.event.delete({
      where: { id },
    });
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
        const sendResult = await this.azureCommunicationService.send({
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
        azureMessageId = sendResult?.messageId ?? null;
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
    // The route carries interceptors rather than a guard, because updates on a
    // public event are public. That makes this the only place the event's own
    // visibility is enforced — without it, the ALL-visibility branch below
    // answered for any event id to any caller, including private events that
    // GET /events/:id refuses to return to the very same caller.
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, visibility: true },
    });

    if (
      !event ||
      !(await this.canViewEvent(event.id, event.visibility, userId, isArranger))
    ) {
      throw new EventNotFoundException(eventId);
    }

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
    if (
      !isArranger &&
      (await this.hasUnapprovedOrganizationArranger(eventId))
    ) {
      return false;
    }

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

  private async hasUnapprovedOrganizationArranger(eventId: string) {
    const unapprovedOrganizationArranger =
      await this.prisma.eventArranger.findFirst({
        where: {
          eventId,
          arranger: {
            organization: {
              is: {
                approved: false,
              },
            },
          },
        },
        select: {
          eventId: true,
        },
      });

    return Boolean(unapprovedOrganizationArranger);
  }

  /**
   * `EventRolesGuard` authorises the caller against the event in the URL, so
   * the write has to be constrained to that same event. Filtering on the
   * update id alone let an arranger of any event delete an update belonging to
   * any other event — the id is not a secret, `getUpdatesForEvent` returns it.
   */
  async deleteUpdateForEvent(eventId: string, updateId: string) {
    const { count } = await this.prisma.eventUpdate.updateMany({
      where: { id: updateId, eventId },
      data: { visibility: EventUpdateVisibility.DELETED },
    });

    if (count === 0) {
      throw new EventUpdateNotFoundException(updateId);
    }
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
