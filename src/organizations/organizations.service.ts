import { HttpException, Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaError } from "../prisma/prisma.constants";
import { CreateOrganizationDto, UpdateOrganizationDto } from "./dto";
import { OrganizationDoesNotExistException } from "./exceptions";
import { OrganizationRole } from "@prisma/client";
import { DuplicateArrangerException } from "../arrangers/exceptions/duplicateArrangerException";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(
    creatorId: string, // id of the user creating the org
    createOrganizationDto: CreateOrganizationDto,
  ) {
    const arrangerId = uuidv4();

    try {
      const newOrganization = await this.prisma.$transaction(async (trx) => {
        //create arranger
        await trx.arranger.create({
          data: { id: arrangerId, isBusiness: true },
        });
        //create organization
        const newOrg = await trx.organization.create({
          data: { arrangerId, ...createOrganizationDto },
        });
        //create userOrganizationRole
        await trx.userOrganizationRole.create({
          data: {
            userId: creatorId,
            organizationId: newOrg.id,
            role: OrganizationRole.ADMIN,
          },
        });
        return newOrg;
      });

      return newOrganization;
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.DuplicateUniqueValue
      ) {
        //unique value duplicated in DB

        throw new DuplicateArrangerException(arrangerId);
      }
      throw new HttpException(error + "\nCreate organization error", 500);
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
      // get arranger id
      const org = await this.prisma.organization.findUnique({
        where: { id },
      });
      if (!org) {
        throw new OrganizationDoesNotExistException(id);
      }
      await this.prisma.arranger.delete({
        where: {
          id: org.arrangerId,
        },
      });
      return org;
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(id);
      }

      throw error;
    }
  }

  async findOrgsByUserIdAndRole(userId: string, role?: OrganizationRole) {
    /* Find all orgs a user has access to

    Args:
      userId - users id
      role - role in org

    Returns: 
      list of org - List<model Organization>
    */
    try {
      let args;
      if (role === undefined) {
        args = { userId: userId };
      } else {
        args = { userId: userId, role: role };
      }
      return await this.prisma.organization.findMany({
        where: {
          organizationRoles: {
            some: args,
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }
  async findOrgWithUsers(orgId: string) {
    /* Find all users in an org and the org itself
    Args:
      orgId - org id
    Returns: 
      the organizatin and all users in it - model Organization
    */
    try {
      return await this.prisma.organization.findUnique({
        where: {
          id: orgId,
        },
        include: {
          organizationRoles: true,
        },
      });
    } catch (error) {
      throw error;
    }
  }
}
