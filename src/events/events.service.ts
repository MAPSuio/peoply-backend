import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  EventArrangerRole,
  EventVisibility,
  OrganizationRole,
} from "../generated/prisma/client";
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
import { escapeHtml } from "../util/html";
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
import { EventCoOrganizerInvitationsService } from "../invitations/services/eventCoOrganizerInvitations.service";
import { EventAccessService } from "../event-access/event-access.service";

/**
 * How many email-bearing updates one event may send in a rolling 24 hours.
 * Attendees cannot opt out per event, only from all arranger mail, so this is
 * the only thing bounding how often an arranger can reach them.
 */
const MAX_EMAIL_UPDATES_PER_DAY = 5;
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arrangersService: ArrangersService,
    private readonly azureStorageService: AzureStorageService,
    private readonly azureCommunicationService: AzureCommunicationService,
    private readonly coOrganizerInvitationsService: EventCoOrganizerInvitationsService,
    private readonly eventAccess: EventAccessService,
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

  async create(
    createEventDto: CreateEventDto,
    arrangerId: string,
    createdByUserId: string,
    eventImage?: Express.Multer.File,
  ) {
    const normalizedCreateEventDto =
      this.normalizeCreateRegistrationData(createEventDto);
    const arranger = await this.arrangersService.findOne(arrangerId);
    if (!arranger) {
      throw new ArrangerNotFoundException(arrangerId);
    }

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
        await trx.eventArranger.create({
          data: {
            role: EventArrangerRole.ADMIN,
            arrangerId,
            eventId,
          },
        });
        await trx.eventCategory.createMany({
          data: normalizedCreateEventDto.categoryIds.map((categoryId) => ({
            categoryId,
            eventId,
          })),
        });

        // Co-organizers are invited, never attached: the organization does not
        // appear on the event until one of its admins accepts.
        await this.coOrganizerInvitationsService.syncInvitations(
          eventId,
          normalizedCreateEventDto.coOrganizerOrganizationIds ?? [],
          createdByUserId,
          arrangerId,
          trx,
        );

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

  async findAll(searchProps: SearchEventDto = {}) {
    const {
      skip = 0,
      take = 10,
      orderBy = "startDate",
      orderDirection = "asc",
    } = searchProps;

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
        /* Unbounded, and this is reached from the unauthenticated
           `GET /events/:id`, so a large event returns one array element per
           registration to any caller. Every consumer only ever computes
           `filter(GOING).length` from it, which `goingCount` below now answers
           directly. Kept for now so deployed clients keep working; see the note
           in the pull request about removing it. */
        registrations: {
          select: { regStatus: true },
        },
        _count: {
          select: {
            registrations: { where: { regStatus: RegStatus.GOING } },
          },
        },
      },
    });

    if (!event || event.archivedAt) {
      throw new EventNotFoundException(urlId);
    }

    const { _count, ...rest } = event;
    return { ...rest, goingCount: _count.registrations };
  }

  async findOneVisibleToUser(
    eventId: string,
    userId?: string,
    isArranger = false,
  ) {
    const event = await this.findOne(eventId);

    if (
      !event ||
      !(await this.eventAccess.canView(
        event.id,
        event.visibility,
        userId,
        isArranger,
      ))
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
      !(await this.eventAccess.canView(
        event.id,
        event.visibility,
        userId,
        isArranger,
      ))
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

  /**
   * Whether the user runs this event — either as the arranger themselves, or
   * as an ADMIN/OWNER of an organization that is an ADMIN arranger of it.
   *
   * Deliberately narrower than EventRolesGuard, which accepts any arranger row
   * regardless of role: a COLLABORATOR must not be able to cancel the
   * invitations that the host sent to other organizations.
   */
  async isEventAdmin(eventId: string, userId: string) {
    const [user, adminArrangers] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { arrangerId: true },
      }),
      this.prisma.eventArranger.findMany({
        where: { eventId, role: EventArrangerRole.ADMIN },
        select: { arrangerId: true },
      }),
    ]);

    if (!user || adminArrangers.length === 0) {
      return false;
    }

    const adminArrangerIds = adminArrangers.map(({ arrangerId }) => arrangerId);

    if (adminArrangerIds.includes(user.arrangerId)) {
      return true;
    }

    const organizationRole = await this.prisma.userOrganizationRole.findFirst({
      where: {
        userId,
        role: { in: [OrganizationRole.ADMIN, OrganizationRole.OWNER] },
        organization: { arrangerId: { in: adminArrangerIds } },
      },
      select: { organizationId: true },
    });

    return organizationRole !== null;
  }

  async update(
    updateEventDto: UpdateEventDto,
    id: string,
    updatedByUserId: string,
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

      const primaryArrangerId = oldEvent.eventArrangers.find(
        (eventArranger) => eventArranger.role === EventArrangerRole.ADMIN,
      )?.arrangerId;

      if (!primaryArrangerId) {
        throw new BadRequestException("Event must have an admin arranger");
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
          await this.coOrganizerInvitationsService.syncInvitations(
            event.id,
            coOrganizerOrganizationIds,
            updatedByUserId,
            primaryArrangerId,
            trx,
          );
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
      /* Counting here and writing the row that increments the count after the
         send left the whole window open: concurrent requests all read the same
         count, all passed, and all sent. Each send is a BCC to every attendee,
         so the cap was the only thing standing between one arranger and an
         unbounded blast. Reserve the slot instead - count and insert together,
         behind a row lock on the event so two requests cannot interleave.

         A send that fails afterwards therefore burns a slot. That is the right
         way round for a rate limit: the alternative is what this replaces. */
      const reserved = await this.prisma.$transaction(async (trx) => {
        // Tagged template: `eventId` is bound as a parameter, never interpolated.
        await trx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;

        const sentInLastDay = await trx.eventUpdate.count({
          where: {
            eventId,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            sendEmail: true,
          },
        });

        if (sentInLastDay >= MAX_EMAIL_UPDATES_PER_DAY) {
          throw new HttpException(
            "Too many updates sent",
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        return trx.eventUpdate.create({
          data: {
            eventId,
            body: updateDto.body,
            subject: updateDto.subject,
            replyTo: updateDto.replyTo,
            azureMessageId: null,
            sendEmail: updateDto.sendEmail,
            visibility: updateDto.visibility,
            createdByUserId,
          },
        });
      });

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

      /* `to` is the hardcoded single-element array two lines up, so this read
         `1 > 0` and was always true. The recipients are the BCC list, and it
         is empty when nobody attending has opted in - in which case there was
         nothing to send, yet a slot was spent and an empty mail went out. */
      if (toEmails.bCC && toEmails.bCC.length > 0) {
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

      if (azureMessageId) {
        await this.prisma.eventUpdate.update({
          where: { id: reserved.id },
          data: { azureMessageId },
        });
      }

      return;
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
      !(await this.eventAccess.canView(
        event.id,
        event.visibility,
        userId,
        isArranger,
      ))
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
    /* The arranger types these into plain text inputs, so no markup is meant
       to survive, and the event title can come straight from a third-party
       ICS feed. */
    const subject = escapeHtml(updateDto.subject);
    const replyTo = escapeHtml(updateDto.replyTo);
    const title = escapeHtml(event.title);
    const urlId = escapeHtml(event.urlId);

    return (
      `<h1>${subject}</h1>\n` +
      `${updateDto.body
        .split("\n")
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("")}\n` +
      `<div style="border-bottom: 1px dashed #000; margin: 1rem 0; width: 100%;"></div>\n` +
      `<p>
      ${
        updateDto.replyTo
          ? "Svar på denne mailen eller send mail til e-posten under for å sende svar til arrangøren.\n" +
            "<br>" +
            `<a href="mailto:${replyTo}?subject=SV: ${subject}">${replyTo}</a>`
          : ""
      }
    </p>` +
      "<p>" +
      `Du mottar denne e-posten fordi du har meldt deg på <a href="https://peoply.app/events/${urlId}" target="_blank">"${title}"</a> på Peoply.\n` +
      "</p>" +
      "<p>" +
      `Hvis du ikke vil motta slike e-poster fra arrangøren, kan du endre dette i <a href="https://peoply.app/me/settings" target="_blank">dine innstillinger</a>` +
      "</p>"
    );
  }
}
