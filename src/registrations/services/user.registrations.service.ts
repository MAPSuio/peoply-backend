import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { CommonRegistrationService } from "./common.registrations.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PrismaError } from "../../prisma/prisma.constants";
import {
  CreateRegistrationDto,
  SearchUserRegistrationDto,
  UserUpdateRegistrationDto,
} from "../dto";
import {
  DuplicateRegistrationException,
  ForeignKeyNotFoundException,
} from "../exceptions";
import { RegStatus, Registration } from ".prisma/client";
import { EventNotFoundException } from "../../events/exceptions";

@Injectable()
export class UserRegistrationService extends CommonRegistrationService {
  constructor(prismaService: PrismaService) {
    super(prismaService);
  }

  async create(userId: string, createRegistrationDto: CreateRegistrationDto) {
    try {
      return this.prismaService.$transaction(async (trx) => {
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
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === PrismaError.DuplicateUniqueValue) {
          throw new DuplicateRegistrationException(
            createRegistrationDto.eventId,
            userId,
          );
        } else if (error.code === PrismaError.ForeignKeyFailed) {
          throw new ForeignKeyNotFoundException(
            createRegistrationDto.eventId,
            userId,
          );
        }
      }
      throw error;
    }
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

    return await this.prismaService.registration.findMany({
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
  }

  async updateAllRegistrationsOfUserToNotGoing(userId: string) {
    // get all registrations of user
    this.prismaService.$transaction(async (trx) => {
      const registrations = await trx.registration.findMany({
        where: {
          userId,
        },
      });

      // update all registrations to not going
      registrations.forEach(async (registration) => {
        try {
          await super.updateRegistration(
            userId,
            registration.eventId,
            RegStatus.NOT_GOING,
          );
        } catch (error) {}
      });
    });
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
