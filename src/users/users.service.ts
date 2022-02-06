import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";
import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { providers } from ".prisma/client";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { PrismaError } from "../prisma/prisma.constants";
import {
  UserAlreadyExistsException,
  UserDoesNotExistException,
} from "./exceptions";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
  ) {}

  /* This will fail if uuid is a duplicate.
     Must be handled by the caller!
  */
  async create(createUserDto: CreateUserDto, provider: providers, sub: string) {
    const { phone, email } = createUserDto;

    /* check that phone and email are unique */
    const emailExists = await this.prisma.users.findUnique({
      where: {
        email,
      },
    });

    const phoneExists = await this.prisma.users.findUnique({
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
      const arrangerID = uuidv4();
      const userID = uuidv4();

      try {
        const [, newUser] = await this.prisma.$transaction([
          this.prisma.arrangers.create({
            data: { arranger_id: arrangerID, is_business: false },
          }),
          this.prisma.users.create({
            data: {
              ...createUserDto,
              arranger_id: arrangerID,
              user_id: userID,
            },
          }),
          this.prisma.provider_users.create({
            data: {
              provider: provider,
              provider_sub: sub,
              user_id: userID,
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

  async findById(id: string) {
    const user = await this.prisma.users.findUnique({
      where: {
        user_id: id,
      },
    });
    return user;
  }

  async findByPhone(phone: string) {
    const user = await this.prisma.users.findUnique({ where: { phone } });
    return user;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.users.findUnique({ where: { email } });
    return user;
  }

  async findByProviderSub(provider: providers, sub: string) {
    const user = await this.prisma.provider_users.findUnique({
      where: {
        provider_sub_provider: {
          provider,
          provider_sub: sub,
        },
      },
      select: {
        user: true,
      },
    });

    return user?.user;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    profileImage?: Express.Multer.File,
  ) {
    const getImageFileName = async () => {
      /* cannot remove and add an image at the same time... */
      if (updateUserDto.removeImage && profileImage) {
        throw new HttpException(
          { message: "The profile image must either be removed or added" },
          409,
        );
      }
      /* check if picture should be removed */
      if (updateUserDto.removeImage && !profileImage) {
        delete updateUserDto.removeImage; // must remove before inserting to db
        return null;
      } else if (profileImage) {
        /* upload image to blob */
        return await this.azureStorageService.upload(
          this.azureStorageService.generateFileNameById(id, profileImage),
          profileImage.buffer,
          AzureStorageContainer.PROFILE_IMAGES,
        );
      } else {
        /* do nothing if an image is not provided */
        return undefined;
      }
    };

    const imageFileName = await getImageFileName();

    try {
      return await this.prisma.users.update({
        where: { user_id: id },
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
      return await this.prisma.users.delete({
        where: {
          user_id: id,
        },
      });
    } catch (error) {
      throw new UserDoesNotExistException(id);
    }
  }
}
