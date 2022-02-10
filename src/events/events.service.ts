import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";
import { EventArrangerRole } from ".prisma/client";
import { PrismaError } from "../prisma/prisma.constants";
import { CreateEventDto, SearchEventDto, UpdateEventDto } from "./dto";
import { ArrangerNotFoundException } from "../arrangers/exceptions";
import { EventNotFoundException } from "./exceptions";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { ArrangersService } from "../arrangers/services";

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
      const [event] = await this.prisma.$transaction([
        this.prisma.event.create({
          data: {
            id: eventId,
            description: createEventDto.description,
            title: createEventDto.title,
            startDate: createEventDto.startDate,
            endDate: createEventDto.endDate,
            capacity: createEventDto.capacity,
            private: createEventDto.private,
            image: imageUrl,
          },
        }),
        this.prisma.eventArranger.create({
          data: {
            role: EventArrangerRole.ADMIN,
            arrangerId,
            eventId,
          },
        }),
        this.prisma.eventCategory.createMany({
          data: createEventDto.categoryIds.map((categoryId) => ({
            categoryId,
            eventId,
          })),
        }),
      ]);
      return event;
    } catch (error) {
      await this.azureStorageService.delete(
        eventImageFileName,
        AzureStorageContainer.EVENT_IMAGES,
      );
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
        numericId: searchProps.numericId,
        startDate: {
          gte: searchProps.afterDate,
          lte: searchProps.beforeDate,
        },
        title: searchProps.title ? { search: searchProps.title } : undefined,
        description: searchProps.description
          ? { search: searchProps.description }
          : undefined,
        capacity: searchProps.capacity,
        private: false,

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
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findOne(id: number) {
    const event = await this.prisma.event.findUnique({
      where: { numericId: id },
    });

    if (!event) {
      throw new EventNotFoundException(id);
    } else {
      return event;
    }
  }

  async findOneWithEventArrangers(id: number) {
    const event = await this.prisma.event.findUnique({
      where: { numericId: id },
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

  async update(id: number, updateEventDto: UpdateEventDto) {
    try {
      return await this.prisma.event.update({
        where: { numericId: id },
        data: { ...updateEventDto },
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

  async remove(id: number) {
    try {
      return await this.prisma.event.delete({
        where: { numericId: id },
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
}
