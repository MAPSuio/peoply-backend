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
import { calculateEditDistance } from "../util/string";
import { Prisma } from "@prisma/client";
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
        visibility: Visibility.PUBLIC,

        eventCategories: searchProps.categoryIds
          ? {
              some: {
                categoryId: { in: searchProps.categoryIds },
              },
            }
          : undefined,

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

  async update(
    updateEventDto: UpdateEventDto,
    id: string,
    newImage?: Express.Multer.File,
  ) {
    const { categoryIds, ...rest } = updateEventDto;

    let newImageUrl: string | null = null;
    let deleteImage = updateEventDto.deleteImage;
    // if endDate is not specified, set to null to delete from database
    if (!rest.endDate) {
      rest.endDate = null;
    }

    try {
      // get event
      const oldEvent = await this.prisma.event.findUnique({
        where: { id },
      });

      if (!oldEvent) {
        throw new EventNotFoundException(id);
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
