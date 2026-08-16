import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ChangeRoleDto,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  ChangeRoleDescriptionDTO,
} from "./dto";
import { OrganizationDoesNotExistException } from "./exceptions";
import { OrganizationRole } from "../generated/prisma/client";
import { EventArrangerRole, Organization } from "../generated/prisma/client";
import { buildDescriptionSearchQuery } from "../util/search";
import { PUBLIC_USER_PROFILE_SELECT } from "../users/user.select";
import { AzureStorageService } from "../azure/azure-storage.service";
import { AzureStorageContainer } from "../azure/azure-storage.constants";
import { SearchOrganizationDto } from "./dto/search-organization.dto";
import { calculateEditDistance } from "../util/string";
import { createUuid, isUUID } from "../util/uuid";
import { DiscordAlertService } from "../discord/discord-alert.service";
import { toDiscordFieldValue } from "../discord/discord-field";

const ORGANIZATION_REPORT_COOLDOWN_MS = 60 * 60 * 1000;
const ORGANIZATION_SOCIAL_LINK_FIELDS = [
  "websiteUrl",
  "instagramUrl",
  "facebookUrl",
  "tiktokUrl",
  "linkedinUrl",
  "youtubeUrl",
] as const;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
    private readonly discordAlert: DiscordAlertService,
  ) {}
  async create(
    creatorId: string, // id of the user creating the org
    createOrganizationDto: CreateOrganizationDto,
  ) {
    const arrangerId = createUuid();

    // The catch this replaces ended in
    // `throw new HttpException(error + "\nCreate organization error", 500)`,
    // which put Prisma's raw message — query fragments and column values
    // included — straight into the response body. P2002 now becomes a 409
    // through PrismaExceptionFilter, and anything else a plain 500.
    return await this.prisma.$transaction(async (trx) => {
      //create arranger
      await trx.arranger.create({
        data: { id: arrangerId, isBusiness: true },
      });

      // urlId of name removing all spaces and special characters and change all to lowercase
      let urlId: string | null = createOrganizationDto.name
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();

      // check if urlId is unique
      const urlIdExists = await trx.organization.findUnique({
        where: { urlId: urlId },
      });
      if (urlIdExists) {
        urlId = null;
      }

      //create organization
      const newOrg = await trx.organization.create({
        data: {
          arrangerId,
          ...createOrganizationDto,
          urlId,
        },
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
  }

  private async findManyOrganizations(
    searchProps: SearchOrganizationDto = {},
    approved?: boolean,
  ) {
    const { skip = 0, take = 10 } = searchProps;

    const descriptionSearch = searchProps.description
      ? buildDescriptionSearchQuery(searchProps.description)
      : undefined;

    const orgs = await this.prisma.organization.findMany({
      skip: skip,
      take: take,
      where: {
        name: searchProps.name
          ? { contains: searchProps.name, mode: "insensitive" }
          : undefined,
        description: descriptionSearch
          ? { search: descriptionSearch }
          : undefined,
        orgNr: searchProps.orgNrs ? { in: searchProps.orgNrs } : undefined,
        approved,
      },
    });

    if (searchProps.name) {
      return orgs
        .map((org) => {
          const nameEditDistance = calculateEditDistance(
            searchProps.name!,
            org.name,
          );
          return {
            org,
            nameEditDistance,
          };
        })
        .sort((a, b) => a.nameEditDistance - b.nameEditDistance)
        .map((org) => org.org);
    }

    return orgs;
  }

  async findAll(searchProps: SearchOrganizationDto = {}) {
    return this.findManyOrganizations(searchProps, true);
  }

  async findAllIncludingUnapproved(searchProps: SearchOrganizationDto = {}) {
    return this.findManyOrganizations(searchProps);
  }

  async findOne(id: string) {
    return this.prisma.organization.findUnique({
      where: {
        id,
      },
    });
  }

  async findOneByUrlId(urlId: string) {
    return this.prisma.organization.findUnique({
      where: {
        urlId,
      },
    });
  }

  /** Looks an organization up by id or urlId, and 404s when it is missing. */
  async findByRefOrThrow(orgIdOrUrlId: string) {
    const org = isUUID(orgIdOrUrlId)
      ? await this.findOne(orgIdOrUrlId)
      : await this.findOneByUrlId(orgIdOrUrlId);

    if (!org) {
      throw new OrganizationDoesNotExistException(orgIdOrUrlId);
    }

    return org;
  }

  async update(
    org: Organization,
    updateOrganizationDto: UpdateOrganizationDto,
    orgImage?: Express.Multer.File,
  ) {
    const normalizedUpdateOrganizationDto = { ...updateOrganizationDto };

    for (const field of ORGANIZATION_SOCIAL_LINK_FIELDS) {
      const value = normalizedUpdateOrganizationDto[field];

      if (typeof value === "string") {
        const trimmedValue = value.trim();
        normalizedUpdateOrganizationDto[field] =
          trimmedValue.length > 0 ? trimmedValue : null;
      }
    }

    if (
      normalizedUpdateOrganizationDto.urlId &&
      org.urlId !== normalizedUpdateOrganizationDto.urlId
    ) {
      const validUrlId =
        normalizedUpdateOrganizationDto.urlId === null
          ? null
          : normalizedUpdateOrganizationDto?.urlId?.replace(/[^a-z0-9]/g, "");
      if (
        validUrlId !== undefined &&
        validUrlId !== normalizedUpdateOrganizationDto.urlId
      ) {
        throw new BadRequestException(
          "urlId can only contain letters from a-z and numbers",
        );
      } else if (validUrlId === "") {
        throw new BadRequestException("urlId can not be empty");
      }

      const urlIdExists =
        validUrlId === null
          ? false
          : await this.prisma.organization.findUnique({
              where: { urlId: validUrlId },
            });
      if (urlIdExists) {
        throw new ConflictException("urlId already exists");
      }
    }

    /* new filename if an image is provided, null if removeImage, and undefined
       if the column should be left alone */
    const imageFileName = await this.azureStorageService.swapImage({
      ownerId: org.id,
      currentImageUrl: org.image,
      newImage: orgImage,
      removeImage: updateOrganizationDto.removeImage,
      container: AzureStorageContainer.ORGANIZATION_IMAGES,
      conflictMessage: "The organization image must either be removed or added",
    });

    /* delete removeImage before inserting to db */
    delete normalizedUpdateOrganizationDto.removeImage;

    try {
      return await this.prisma.organization.update({
        where: { id: org.id },
        /* The DTO spread goes first now. It used to come last, so anything the
           client sent under `image` overrode the name of the file that had
           just been uploaded. `image` is no longer a DTO property, which
           closes that on its own — this is belt and braces, so re-adding the
           field one day cannot silently reopen it. */
        data: {
          ...normalizedUpdateOrganizationDto,
          ...(imageFileName !== undefined && {
            image: imageFileName,
          }),
        },
      });
    } catch (error) {
      // Kept for the cleanup only: the image is uploaded before the update,
      // so a failure would leave it orphaned.
      if (imageFileName) {
        await this.azureStorageService.deleteUploadedImageQuietly(
          imageFileName,
          AzureStorageContainer.ORGANIZATION_IMAGES,
          `Organization ${org.id} update`,
        );
      }

      throw error;
    }
  }

  async remove(id: string) {
    // get arranger id
    const org = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!org) {
      throw new OrganizationDoesNotExistException(id);
    }

    // The catch this replaces tested for P2001, which the arranger delete
    // below does not raise — a missing row raises P2025. Deleting an already
    // deleted organization answered 500 instead of 404.
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
  }

  async findOrgsByUserIdAndRole(userId: string, role?: OrganizationRole) {
    /* Find all orgs a user has access to

    Args:
      userId - users id
      role - role in org

    Returns:
      list of org - List<model Organization>
    */
    return await this.prisma.organization.findMany({
      where: {
        organizationRoles: {
          // Prisma drops undefined fields from a where clause, so an
          // undefined role is already "any role" — the branch that built
          // two different objects was doing the same thing twice.
          some: { userId: userId, role: role },
        },
      },
      include: { organizationRoles: { where: { userId: userId } } },
    });
  }
  async findOrgWithUsers(orgId: string) {
    /* Find all users in an org and the org itself
    Args:
      orgId - org id
    Returns:
      the organization and all users in it - model Organization
    */
    return await this.prisma.organization.findUnique({
      where: {
        id: orgId,
      },
      include: {
        organizationRoles: {
          include: {
            user: { select: PUBLIC_USER_PROFILE_SELECT },
          },
        },
      },
    });
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

  async updateApproval(orgId: string, approved: boolean) {
    return this.prisma.organization.update({
      where: {
        id: orgId,
      },
      data: {
        approved,
      },
    });
  }

  private async getLatestOrganizationReport(
    reporterId: string,
    organizationId: string,
    client: Pick<PrismaService, "organizationReport"> = this.prisma,
  ) {
    return client.organizationReport.findFirst({
      where: {
        userId: reporterId,
        organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    });
  }

  async getOrganizationReportStatus(
    reporterId: string,
    organizationId: string,
    client?: Pick<PrismaService, "organizationReport">,
  ) {
    const latestReport = await this.getLatestOrganizationReport(
      reporterId,
      organizationId,
      client,
    );

    if (!latestReport) {
      return {
        canReport: true,
        nextReportAt: null,
        remainingSeconds: 0,
      };
    }

    const nextReportAt = new Date(
      latestReport.createdAt.getTime() + ORGANIZATION_REPORT_COOLDOWN_MS,
    );
    const remainingMs = nextReportAt.getTime() - Date.now();

    if (remainingMs <= 0) {
      return {
        canReport: true,
        nextReportAt: null,
        remainingSeconds: 0,
      };
    }

    return {
      canReport: false,
      nextReportAt: nextReportAt.toISOString(),
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  async reportOrganization(reporterId: string, organization: Organization) {
    /* Reading the cooldown and then inserting the report is a check-then-act,
       and OrganizationReport has only an index on (organizationId, userId,
       createdAt) - no unique constraint to fall back on. N concurrent reports
       for the same organization from one account all observed no prior report,
       all passed the once-per-hour check, all inserted, and all posted an
       alert that pings @everyone. Holding the organization row makes them take
       turns, so the second one sees the first one's row. */
    const reportStatus = await this.prisma.$transaction(async (trx) => {
      await trx.$queryRaw`SELECT id FROM organizations WHERE id = ${organization.id} FOR UPDATE`;

      const status = await this.getOrganizationReportStatus(
        reporterId,
        organization.id,
        trx,
      );

      if (status.canReport) {
        await trx.organizationReport.create({
          data: { organizationId: organization.id, userId: reporterId },
        });
      }

      return status;
    });

    if (!reportStatus.canReport) {
      throw new HttpException(
        {
          message: "You can only report the same organization once per hour",
          nextReportAt: reportStatus.nextReportAt,
          remainingSeconds: reportStatus.remainingSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const reporter = await this.prisma.user.findUnique({
      where: {
        id: reporterId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!this.discordAlert.isConfigured) {
      this.logger.warn(
        `Organization ${organization.id} was reported, but DISCORD_ALERT_WEBHOOK_URL is not configured`,
      );
      return { reported: true };
    }

    const reporterName = reporter
      ? `${reporter.firstName} ${reporter.lastName}`.trim()
      : "Ukjent bruker";
    const frontendUrl = process.env.FRONTEND_URL ?? "https://peoply.app";
    const organizationPath = `/orgs/${organization.urlId ?? organization.id}`;

    await this.discordAlert.send({
      title: "Forening rapportert",
      color: 0xffa500,
      content: "@everyone",
      context: "Organization report",
      fields: [
        {
          /* The organization's own author chose this. Unbounded, it
             made the whole webhook 400 and the report never reached
             anyone; unescaped, it could draw convincing extra fields
             and appear to name a different organization. */
          name: "Forening",
          value: toDiscordFieldValue(organization.name),
          inline: true,
        },
        {
          name: "Org-ID",
          value: organization.id,
          inline: true,
        },
        {
          name: "Rapportert av",
          value: toDiscordFieldValue(
            reporter ? `${reporterName} (${reporter.email})` : reporterId,
          ),
        },
        {
          name: "Side",
          value: `${frontendUrl}${organizationPath}`,
        },
      ],
    });

    return {
      reported: true,
      nextReportAt: new Date(
        Date.now() + ORGANIZATION_REPORT_COOLDOWN_MS,
      ).toISOString(),
      remainingSeconds: Math.ceil(ORGANIZATION_REPORT_COOLDOWN_MS / 1000),
    };
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

  async deleteMember(orgId: string, userId: string) {
    return await this.prisma.userOrganizationRole.delete({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: userId,
        },
      },
    });
  }

  async getFollowers(orgId: string) {
    const org = await this.findByRefOrThrow(orgId);

    return await this.prisma.arrangerFollower.findMany({
      where: {
        arrangerId: org.arrangerId,
      },
      include: {
        user: { select: PUBLIC_USER_PROFILE_SELECT },
      },
    });
  }
}
