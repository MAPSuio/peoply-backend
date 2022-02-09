import { Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaError } from "../prisma/prisma.constants";
import { CreateOrganizationDto, UpdateOrganizationDto } from "./dto";
import {
  OrganizationAlreadyExistsException,
  OrganizationDoesNotExistException,
} from "./exceptions";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createOrganizationDto: CreateOrganizationDto) {
    const { orgNr } = createOrganizationDto;

    /* orgNr is unique */
    const orgNrExists = await this.prisma.organization.findUnique({
      where: {
        orgNr,
      },
    });

    const errors: { orgNr?: string } = {};

    if (orgNrExists) {
      errors.orgNr = "Organization number already exists";
      throw new OrganizationAlreadyExistsException(errors);
    } else {
      const arrangerId = uuidv4();

      try {
        const [, newOrganization] = await this.prisma.$transaction([
          this.prisma.arranger.create({
            data: { id: arrangerId, isBusiness: true },
          }),
          this.prisma.organization.create({
            data: { arrangerId, ...createOrganizationDto },
          }),
        ]);

        return newOrganization;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === PrismaError.DuplicateUniqueValue
        ) {
          //unique value duplicated in DB

          throw error;
        } else {
          throw error;
        }
      }
    }
  }

  async findOne(id: string) {
    try {
      return await this.prisma.organization.findUnique({
        where: {
          id,
        },
      });
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: updateOrganizationDto,
      });
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.organization.delete({
        where: {
          id,
        },
      });
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }
}
