import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../../prisma/prisma.service";
import { randomUUID } from "crypto";
import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { Provider, User } from ".prisma/client";
import { CreateUserDto, UpdateUserDto } from "../dto";
import { PrismaError } from "../../prisma/prisma.constants";
import {
  UserAlreadyExistsException,
  UserDoesNotExistException,
} from "../exceptions";
import { AzureStorageService } from "../../azure/azure-storage.service";
import { AzureStorageContainer } from "../../azure/azure-storage.constants";
import { SearchUserDto } from "../dto/search-user.dto";
import { calculateEditDistance } from "../../util/string";
import { EventArrangerRole, UserSeenUpdateType } from "@prisma/client";
import { UserRegistrationService } from "../../registrations/services";
import { createUuid } from "../../util/uuid";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
    private readonly userRegistrationService: UserRegistrationService,
  ) {}

  /* This will fail if uuid is a duplicate.
     Must be handled by the caller!
  */
  async create(createUserDto: CreateUserDto, provider: Provider, sub: string) {
    const { phone, email } = createUserDto;

    /* check that phone and email are unique */
    const emailExists = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    let phoneExists: User | null = null;
    if (phone) {
      phoneExists = await this.prisma.user.findUnique({
        where: {
          phone,
        },
      });
    }

    const errors: { email?: string; phone?: string } = {};

    if (emailExists) {
      errors.email = "there is already a user registered with this email";
    }
    if (phoneExists) {
      errors.phone =
        "there is already a user registered with this phone number";
    }

    if (emailExists || phoneExists) {
      throw new UserAlreadyExistsException(errors);
    } else {
      const arrangerId = createUuid();
      const userId = createUuid();

      try {
        const [, newUser] = await this.prisma.$transaction([
          this.prisma.arranger.create({
            data: { id: arrangerId, isBusiness: false },
          }),
          this.prisma.user.create({
            data: {
              ...createUserDto,
              arrangerId,
              id: userId,
            },
          }),
          this.prisma.providerUser.create({
            data: {
              provider: provider,
              sub: sub,
              id: userId,
            },
          }),
        ]);

        return newUser;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === PrismaError.DuplicateUniqueValue
        ) {
          //unique value duplicated in DB
          // eslint-disable-next-line no-console
          console.log("Holy shit! uuid collision");

          throw error;
        } else {
          throw error;
        }
      }
    }
  }

  async findAll(searchProps: SearchUserDto = {}, skip = 0, take = 10) {
    /* splits name by ORing the different parts of the name */
    const generateSearchQuery = (name: string) =>
      name.toLowerCase().split(" ").join(" | ");

    const { name } = searchProps;
    const users = await this.prisma.user.findMany({
      where: {
        ...(name && {
          OR: [
            { firstName: { search: generateSearchQuery(name) } },
            { lastName: { search: name.split(" ").slice(-1)[0] } },
            {
              firstName: {
                startsWith: name.split(" ")[0],
                mode: "insensitive",
              },
            },
            {
              lastName: {
                startsWith: name.split(" ").slice(-1)[0],
                mode: "insensitive",
              },
            },
          ],
        }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        image: true,
        description: true,
      },
      skip,
      take,
    });

    if (name) {
      /* sort the user by edit distance before returning */
      return users
        .map((user) => {
          const firstNameEditDistance = calculateEditDistance(
            name,
            user.firstName,
          );
          const lastNameEditDistance = calculateEditDistance(
            name,
            user.lastName,
          );
          const editDistance = Math.min(
            firstNameEditDistance,
            lastNameEditDistance,
          );
          return {
            user,
            editDistance,
          };
        })
        .sort((a, b) => a.editDistance - b.editDistance)
        .map((user) => user.user); //  remove editdistance before returning
    }

    return users;
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      include: {
        userAllergens: true,
        userSeenUpdates: true,
      },
    });
    return user;
  }

  async findByPhone(phone: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    return user;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user;
  }

  async findForLocalAuth() {
    return await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      take: 20,
    });
  }

  async findByProviderSub(provider: Provider, sub: string) {
    const user = await this.prisma.providerUser.findUnique({
      where: {
        sub_provider: {
          provider,
          sub: sub,
        },
      },
      select: {
        user: true,
      },
    });

    return user?.user;
  }

  async rotateRefreshTokenId(userId: string) {
    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshTokenId: randomUUID(),
      },
    });
  }

  async update(
    user: User,
    updateUserDto: UpdateUserDto,
    profileImage?: Express.Multer.File,
  ) {
    /* returns new filename if image is provided, null if removeImage, and undefined if no change should happen in db */
    const getImageFileName = async () => {
      /* cannot remove and add an image at the same time... */
      if (updateUserDto.removeImage && profileImage) {
        throw new HttpException(
          { message: "The profile image must either be removed or added" },
          409,
        );
      }
      /* existing image must be deleted if either removing or uploading a new one*/
      if (user.image && (updateUserDto.removeImage || profileImage)) {
        const imageName = user.image.slice(user.image.lastIndexOf("/") + 1); // remove url portion
        await this.azureStorageService.delete(
          imageName,
          AzureStorageContainer.PROFILE_IMAGES,
        );
      }

      /* upload image if one is provided */
      if (profileImage) {
        return await this.azureStorageService.upload(
          this.azureStorageService.generateFileNameById(user.id, profileImage),
          profileImage.buffer,
          AzureStorageContainer.PROFILE_IMAGES,
        );
      } else if (updateUserDto.removeImage) {
        return null;
      }

      return undefined;
    };

    const imageFileName = await getImageFileName();

    /* delete removeImage before inserting to db */
    delete updateUserDto.removeImage;
    const allergens = updateUserDto.allergens;
    delete updateUserDto.allergens;

    try {
      return await this.prisma.$transaction(async (trx) => {
        if (allergens) {
          await trx.userAllergen.deleteMany({
            where: {
              userId: user.id,
            },
          });
          await trx.userAllergen.createMany({
            data: allergens.map((allergen) => ({
              userId: user.id,
              allergenId: allergen,
            })),
          });
        }
        return await trx.user.update({
          where: { id: user.id },
          data: {
            ...(imageFileName !== undefined && {
              image: imageFileName,
            }),
            ...updateUserDto,
          },
        });
      });
    } catch (error) {
      /* delete uploaded image if anything fails */
      if (imageFileName) {
        this.azureStorageService.delete(
          imageFileName,
          AzureStorageContainer.PROFILE_IMAGES,
        );
      }

      if (error instanceof PrismaClientKnownRequestError) {
        switch (error.code) {
          case PrismaError.EntityNotFound:
            throw new BadRequestException("No such user exists.");

          default:
            throw error;
        }
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      // get arranger id
      const user = await this.prisma.user.findUnique({
        where: { id },
      });
      if (!user) {
        throw new UserDoesNotExistException(id);
      }

      await this.prisma.$transaction(async (trx) => {
        //delete all events hosted by user
        await trx.event.deleteMany({
          where: {
            eventArrangers: {
              some: {
                arrangerId: user.arrangerId,
                role: EventArrangerRole.ADMIN,
              },
            },
          },
        });

        this.userRegistrationService.updateAllRegistrationsOfUserToNotGoing(
          user.id,
        );

        // delete arranger which automatically deletes user because of ON DELETE CASCADE in schema.prisma
        await trx.arranger.delete({
          where: {
            id: user.arrangerId,
          },
        });
      });

      return user;
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new UserDoesNotExistException(id);
      }

      throw error;
    }
  }

  async findUpdatesSeenByUser(userId: string) {
    const res = await this.prisma.userSeenUpdate.findMany({
      where: {
        userId,
      },
    });

    return res.map((r) => r.update);
  }

  async userSeenUpdate(userId: string, update: UserSeenUpdateType) {
    const res = await this.prisma.userSeenUpdate.findUnique({
      where: {
        userId_update: {
          userId,
          update,
        },
      },
    });

    if (res) {
      return true;
    }
    return false;
  }

  async markUserSeenUpdate(userId: string, update: UserSeenUpdateType) {
    const res = await this.prisma.userSeenUpdate.upsert({
      where: {
        userId_update: {
          userId,
          update,
        },
      },
      create: {
        userId,
        update,
      },
      update: {},
    });

    return res;
  }
}
