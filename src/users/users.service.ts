import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserAlreadyExistsException } from "./exceptions/userAlreadyExists.exception";
import { UserDoesNotExistException } from "./exceptions/userDoesNotExist.exception";
import { v4 as uuidv4 } from "uuid";
import { users } from "@prisma/client";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /* This will fail if uuid is a duplicate.
     Must be handled by the caller!
  */
  async create(createUserDto: CreateUserDto) {
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

      try {
        const [, newUser] = await this.prisma.$transaction([
          this.prisma.arrangers.create({
            data: { arranger_id: arrangerID, is_business: false },
          }),
          this.prisma.users.create({
            data: { ...createUserDto, arranger_id: arrangerID },
          }),
        ]);

        return newUser;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === prismaError.DuplicateUniqueValue
        ) {
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

    if (!user) {
      throw new UserDoesNotExistException(id);
    } else {
      return user;
    }
  }

  async findByEmailOrPhone(email?: string, phone?: string) {
    if (!(phone || email)) {
      throw new HttpException("Wrong args provided", HttpStatus.BAD_REQUEST);
    }

    let user: users | null;
    if (email) {
      user = await this.prisma.users.findUnique({ where: { email } });
    } else if (phone) {
      user = await this.prisma.users.findUnique({ where: { phone } });
    } else {
      user = null;
    }

    if (!user) {
      throw new UserDoesNotExistException();
    } else {
      return user;
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      return await this.prisma.users.update({
        where: { user_id: id },
        data: updateUserDto,
      });
    } catch (error) {
      throw new UserDoesNotExistException(id);
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
