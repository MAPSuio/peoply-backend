import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserAlreadyExistsException } from "./exceptions/userAlreadyExists.exception";
import { UserDoesNotExistException } from "./exceptions/userDoesNotExist.exception";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
      return this.prisma.users.create({ data: createUserDto });
    }
  }

  async findOne(id: string) {
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
