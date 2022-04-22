import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";
import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { Provider, User } from ".prisma/client";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { PrismaError } from "../prisma/prisma.constants";
import {
  UserAlreadyExistsException,
  UserDoesNotExistException,
} from "./exceptions";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { SearchUserDto } from "./dto/search-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
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

    const phoneExists = await this.prisma.user.findUnique({
      where: {
        phone,
      },
    });

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
      const arrangerId = uuidv4();
      const userId = uuidv4();

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
    /* function to calculate edit distance between two strings */
    function calculateEditDistance(s1: string, s2: string): number {
      const m = s1.length;
      const n = s2.length;
      const d = new Array(m + 1);
      for (let i = 0; i <= m; i++) {
        d[i] = new Array(n + 1);
        d[i][0] = i;
      }
      for (let j = 0; j <= n; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= m; i++) {
          if (s1[i - 1] === s2[j - 1]) {
            d[i][j] = d[i - 1][j - 1];
          } else {
            d[i][j] = Math.min(
              d[i - 1][j - 1] + 1,
              d[i][j - 1] + 1,
              d[i - 1][j] + 1,
            );
          }
        }
      }
      return d[m][n];
    }

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
          ],
        }),
      },
      skip,
      take,
    });

    if (name) {
      /* sort the user by edit distance before returning */
      return users
        .map((user) => {
          const editDistance = calculateEditDistance(
            name,
            user.firstName + " " + user.lastName,
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

    try {
      return await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(imageFileName !== undefined && {
            image: imageFileName,
          }),
          ...updateUserDto,
        },
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
      return await this.prisma.user.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      throw new UserDoesNotExistException(id);
    }
  }
}
