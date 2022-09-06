import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaError } from "../prisma/prisma.constants";
import {
  ChangeRoleDto,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  ChangeRoleDescriptionDTO,
} from "./dto";
import { OrganizationDoesNotExistException } from "./exceptions";
import { OrganizationRole } from ".prisma/client";
import { DuplicateArrangerException } from "../arrangers/exceptions/duplicateArrangerException";
import { EventArrangerRole, Organization } from "@prisma/client";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { SearchOrganizationDto } from "./dto/search-organization.dto";
import { calculateEditDistance } from "../util/string";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
  ) {}
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
            role: OrganizationRole.OWNER,
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

  async findAll(searchProps: SearchOrganizationDto = {}, skip = 0, take = 10) {
    const generateSearchQuery = (name: string) =>
      name.toLowerCase().split(" ").join(" & ");

    const orgs = await this.prisma.organization.findMany({
      skip: skip,
      take: take,
      where: {
        name: searchProps.name
          ? { contains: searchProps.name, mode: "insensitive" }
          : undefined,
        description: searchProps.description
          ? { search: generateSearchQuery(searchProps.description) }
          : undefined,
        orgNr: searchProps.orgNrs ? { in: searchProps.orgNrs } : undefined,
      },
    });

    if (searchProps.name) {
      return orgs
        .map((org) => {
          const nameEditDistance = calculateEditDistance(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            searchProps.name!,
            org.name,
          );
          return {
            org,
            nameEditDistance,
          };
        })
        .sort((a, b) => a.nameEditDistance - b.nameEditDistance)
        .map((org) => org.org); // remove the nameEditDistance from the object
    }
    return orgs;
  }

  async findOne(id: string) {
    return this.prisma.organization.findUnique({
      where: {
        id,
      },
    });
  }

  async update(
    org: Organization,
    updateOrganizationDto: UpdateOrganizationDto,
    orgImage?: Express.Multer.File,
  ) {
    /* returns new filename if image is provided, null if removeImage, and undefined if no change should happen in db */
    const getImageFileName = async () => {
      /* cannot remove and add an image at the same time... */
      if (updateOrganizationDto.removeImage && orgImage) {
        throw new HttpException(
          { message: "The organization image must either be removed or added" },
          409,
        );
      }
      /* existing image must be deleted if either removing or uploading a new one*/
      if (org.image && (updateOrganizationDto.removeImage || orgImage)) {
        const imageName = org.image.slice(org.image.lastIndexOf("/") + 1); // remove url portion
        await this.azureStorageService.delete(
          imageName,
          AzureStorageContainer.ORGANIZATION_IMAGES,
        );
      }

      /* upload image if one is provided */
      if (orgImage) {
        return await this.azureStorageService.upload(
          this.azureStorageService.generateFileNameById(org.id, orgImage),
          orgImage.buffer,
          AzureStorageContainer.ORGANIZATION_IMAGES,
        );
      } else if (updateOrganizationDto.removeImage) {
        return null;
      }

      return undefined;
    };

    const imageFileName = await getImageFileName();

    /* delete removeImage before inserting to db */
    delete updateOrganizationDto.removeImage;

    try {
      return await this.prisma.organization.update({
        where: { id: org.id },
        data: {
          ...(imageFileName !== undefined && {
            image: imageFileName,
          }),
          ...updateOrganizationDto,
        },
      });
    } catch (error) {
      /* delete uploaded image if anything fails */
      if (imageFileName) {
        this.azureStorageService.delete(
          imageFileName.slice(imageFileName.lastIndexOf("/") + 1),
          AzureStorageContainer.ORGANIZATION_IMAGES,
        );
      }

      if (error instanceof PrismaClientKnownRequestError) {
        switch (error.code) {
          case PrismaError.EntityNotFound:
            throw new BadRequestException("No such organization exists.");

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
      const org = await this.prisma.organization.findUnique({
        where: { id },
      });
      if (!org) {
        throw new OrganizationDoesNotExistException(id);
      }

      await this.prisma.$transaction(async (trx) => {
        //delete all events hosted by organization
        await trx.event.deleteMany({
          where: {
            eventArrangers: {
              some: {
                arrangerId: org.arrangerId,
                role: EventArrangerRole.ADMIN,
              },
            },
          },
        });

        // delete arranger which automatically deletes organization because of ON DELETE CASCADE in schema.prisma
        await trx.arranger.delete({
          where: {
            id: org.arrangerId,
          },
        });
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
        include: { organizationRoles: { where: { userId: userId } } },
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
      the organization and all users in it - model Organization
    */
    try {
      return await this.prisma.organization.findUnique({
        where: {
          id: orgId,
        },
        include: {
          organizationRoles: {
            include: {
              user: {
                select: {
                  id: true,
                  image: true,
                  firstName: true,
                  lastName: true,
                  description: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }
  async getArrangerId(orgId: string) {
    /* Find the arranger id of an org
    Args:
      orgId - org id
    Returns:
      arranger id - string
    */
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: orgId,
      },
    });
    return organization?.arrangerId;
  }
  async findByArrangerId(arrangerId: string) {
    /* Find the org id of an arranger
    Args:
      arrangerId - arranger id
    Returns:
      org id - string
    */
    const organization = await this.prisma.organization.findUnique({
      where: {
        arrangerId: arrangerId,
      },
      include: {
        organizationRoles: true,
      },
    });
    return organization;
  }
  async checkUserRole(
    userId: string,
    orgId: string,
    roles: Array<OrganizationRole>,
  ) {
    /* Check if a user is in an org
    Args:
      userId - user id
      orgId - org id
    Returns:
      boolean - true if user is in org, false if not
    */
    const userRole = await this.prisma.userOrganizationRole.findFirst({
      where: {
        userId: userId,
        organizationId: orgId,
        role: { in: roles },
      },
    });
    return userRole !== null;
  }

  async getOrganizationUser(userId: string, orgId: string) {
    /* Find the user in an org
    Args:
      userId - user id
      orgId - org id
    Returns:
      user - model User
    */
    const user = await this.prisma.userOrganizationRole.findUnique({
      where: {
        organizationId_userId: {
          userId: userId,
          organizationId: orgId,
        },
      },
    });
    return user;
  }

  async changeOwner(orgId: string, oldOwnerId: string, newOwnerId: string) {
    /* Change the owner of an org
    Args:
      orgId - org id
      oldOwnerId - old owner id
      newOwnerId - new owner id
      newRole - new role in org, ADMIN by default
    Returns:
      the new owner - model User
    */
    // new role to old owner
    return await this.prisma.$transaction(async (trx) => {
      await trx.userOrganizationRole.update({
        where: {
          organizationId_userId: {
            userId: oldOwnerId,
            organizationId: orgId,
          },
        },
        data: {
          role: OrganizationRole.ADMIN,
        },
      });
      return await trx.userOrganizationRole.update({
        where: {
          organizationId_userId: {
            userId: newOwnerId,
            organizationId: orgId,
          },
        },
        data: {
          role: OrganizationRole.OWNER,
        },
      });
    });
  }

  async changeUserRole(orgId: string, changeRoleDto: ChangeRoleDto) {
    /* Change the role of a user in an org
    Args:
      orgId - org id
      changeRoleDto - model ChangeRoleDto
    Returns:
      the new user - model User
    */

    return await this.prisma.userOrganizationRole.update({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: changeRoleDto.userId,
        },
      },
      data: {
        role: changeRoleDto.role,
      },
    });
  }

  async changeUserRoleDescription(
    orgId: string,
    userId: string,
    changeRoleDescriptionDTO: ChangeRoleDescriptionDTO,
  ) {
    /* if the new description is empty set the value to null*/
    let newDescription = null;
    if (changeRoleDescriptionDTO.description !== "") {
      newDescription = changeRoleDescriptionDTO.description;
    }

    return await this.prisma.userOrganizationRole.update({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: userId,
        },
      },
      data: {
        roleDescription: newDescription,
      },
    });
  }
}
