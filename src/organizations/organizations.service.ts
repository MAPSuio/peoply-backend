import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { OrganizationAlreadyExistsException } from "./exceptions/organizationAlreadyExists.exception";
import { v4 as uuidv4 } from "uuid";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { OrganizationDoesNotExistException } from "./exceptions/organizationDoesNotExist.exception";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createOrganizationDto: CreateOrganizationDto) {
    const { org_nr } = createOrganizationDto;

    /* orgNr is unique */
    const orgNrExists = await this.prisma.organizations.findUnique({
      where: {
        org_nr,
      },
    });

    const errors: { org_nr?: string } = {};

    if (orgNrExists) {
      errors.org_nr = "Organization number already exists";
      throw new OrganizationAlreadyExistsException(errors);
    } else {
      const arrangerID = uuidv4();

      try {
        const [, newOrganization] = await this.prisma.$transaction([
          this.prisma.arrangers.create({
            data: { arranger_id: arrangerID, is_business: true },
          }),
          this.prisma.organizations.create({
            data: { arranger_id: arrangerID, ...createOrganizationDto },
          }),
        ]);

        return newOrganization;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === prismaError.DuplicateUniqueValue
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
      return await this.prisma.organizations.findUnique({
        where: {
          organization_id: id,
        },
      });
    } catch (error) {
      if (error.code === prismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    try {
      return await this.prisma.organizations.update({
        where: { organization_id: id },
        data: updateOrganizationDto,
      });
    } catch (error) {
      if (error.code === prismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.organizations.delete({
        where: {
          organization_id: id,
        },
      });
    } catch (error) {
      if (error.code === prismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }
}
