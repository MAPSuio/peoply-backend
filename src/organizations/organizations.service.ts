import { Injectable } from "@nestjs/common";
import { CreateArrangerDto } from "src/arrangers/dto/create-arranger.dto";
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
      const createArranger = new CreateArrangerDto();
      createArranger.is_business = true;

      const arrangerID = uuidv4();

      createArranger.arranger_id = arrangerID;
      createOrganizationDto.arranger_id = arrangerID;

      try {
        const [, newOrganization] = await this.prisma.$transaction([
          this.prisma.arrangers.create({
            data: createArranger,
          }),
          this.prisma.organizations.create({ data: createOrganizationDto }),
        ]);

        return newOrganization;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === "P2002"
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
      throw new OrganizationDoesNotExistException(id);
    }
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    try {
      return await this.prisma.organizations.update({
        where: { organization_id: id },
        data: updateOrganizationDto,
      });
    } catch (error) {
      throw new OrganizationDoesNotExistException(id);
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
      throw new OrganizationDoesNotExistException(id);
    }
  }
}
