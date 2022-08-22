import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";
import { EventArrangerRole, Visibility } from ".prisma/client";
import { PrismaError } from "../prisma/prisma.constants";
import { CreateEventDto, SearchEventDto, UpdateEventDto } from "./dto";
import { ArrangerNotFoundException } from "../arrangers/exceptions";
import { EventNotFoundException } from "./exceptions";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { ArrangersService } from "../arrangers/services";
import { Event } from ".prisma/client";
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arrangersService: ArrangersService,
    private readonly azureStorageService: AzureStorageService,
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
            capacity: createEventDto.capacity,
            visibility: createEventDto.visibility,
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
    return await this.prisma.event.findMany({
      skip,
      take,
      where: {
        urlId: searchProps.urlId,
        startDate: {
          gte: searchProps.afterDate,
          lte: searchProps.beforeDate,
        },
        title: searchProps.title ? { search: searchProps.title } : undefined,
        description: searchProps.description
          ? { search: searchProps.description }
          : undefined,
        capacity: searchProps.capacity,
        visibility: Visibility.PUBLIC,

        // find arranger if specified
        // if not specified, but user is, then find arranger using userId
        // if not specified, but organization is, then find arranger using organizationId
        eventArrangers:
          searchProps.arrangerId ||
          searchProps.userId ||
          searchProps.organizationId
            ? {
                every: {
                  arranger: searchProps.arrangerId
                    ? { id: searchProps.arrangerId }
                    : {
                        user: searchProps.userId
                          ? { id: searchProps.userId }
                          : undefined,
                        organization: searchProps.organizationId
                          ? { id: searchProps.organizationId }
                          : undefined,
                      },
                },
              }
            : undefined,
      },
      include: {
        eventArrangers: {
          include: {
            arranger: {
              include: {
                user: {
                  select: { firstName: true, lastName: true, image: true },
                },
                organization: { select: { name: true, image: true } },
              },
            },
          },
        },
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findOne(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    return event;
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
                organization: { select: { id: true, name: true, image: true } },
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

    if (!event) {
      throw new EventNotFoundException(urlId);
    } else {
      return event;
    }
  }

  async findOneWithArrangers(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: id },
      include: {
        eventArrangers: true,
      },
    });

    if (!event) {
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

    if (!event) {
      throw new EventNotFoundException(urlId);
    } else {
      return event;
    }
  }

  async update(urlId: string, updateEventDto: UpdateEventDto) {
    try {
      return await this.prisma.event.update({
        where: { urlId: urlId },
        data: { ...updateEventDto },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(urlId);
      } else {
        throw error;
      }
    }
  }

  async remove(urlId: string) {
    try {
      return await this.prisma.event.delete({
        where: { urlId: urlId },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(urlId);
      } else {
        throw error;
      }
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
}
