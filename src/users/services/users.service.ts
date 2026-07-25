import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "../../prisma/prisma.service";
import { randomUUID } from "crypto";
import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { Provider, User } from ".prisma/client";
import { CreateUserDto, UpdateUserDto } from "../dto";
import { PrismaError } from "../../prisma/prisma.constants";
import {
  UserAlreadyExistsException,
  UserDoesNotExistException,
} from "../exceptions";
import { AzureStorageService } from "../../azure/azure-storage.service";
import { AzureStorageContainer } from "../../azure/azure-storage.constants";
import { SearchUserDto } from "../dto/search-user.dto";
import { calculateEditDistance } from "../../util/string";
import { EventArrangerRole, UserSeenUpdateType } from "@prisma/client";
import { UserRegistrationService } from "../../registrations/services";
import { createUuid } from "../../util/uuid";
import { MAX_PAGE_SIZE } from "../../util/pagination";

/**
 * Upper bound on the number of rows a name search may load for in-memory
 * ranking. Derived from MAX_PAGE_SIZE rather than hardcoded: ranking happens
 * after the query, so the candidate set has to stay well above the largest
 * page a client may ask for, or the best matches never reach the page.
 */
const USER_SEARCH_CANDIDATE_LIMIT = MAX_PAGE_SIZE * 5;

const SEARCH_VARIANT_REPLACEMENTS = [
  ["aa", "å"],
  ["ae", "æ"],
  ["oe", "ø"],
  ["oy", "øy"],
] as const;

const normalizeWhitespace = (value: string) =>
  value.trim().replace(/\s+/g, " ");

const normalizeSearchValue = (value: string) =>
  normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/aa/g, "a")
      .replace(/oe/g, "o")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " "),
  );

const buildSearchVariants = (token: string) => {
  const normalizedToken = token.toLowerCase();
  const variants = new Set([normalizedToken]);

  for (const [from, to] of SEARCH_VARIANT_REPLACEMENTS) {
    if (normalizedToken.includes(from)) {
      variants.add(normalizedToken.split(from).join(to));
    }
  }

  return Array.from(variants);
};

const scoreUserSearchMatch = (
  user: {
    firstName: string;
    lastName: string;
  },
  normalizedQuery: string,
  normalizedTokens: string[],
) => {
  const normalizedFirstName = normalizeSearchValue(user.firstName);
  const normalizedLastName = normalizeSearchValue(user.lastName);
  const normalizedFullName =
    `${normalizedFirstName} ${normalizedLastName}`.trim();

  let score = 0;

  if (normalizedFullName === normalizedQuery) {
    score += 200;
  }

  if (
    normalizedFirstName === normalizedQuery ||
    normalizedLastName === normalizedQuery
  ) {
    score += 150;
  }

  if (normalizedFullName.startsWith(normalizedQuery)) {
    score += 100;
  }

  if (
    normalizedFirstName.startsWith(normalizedQuery) ||
    normalizedLastName.startsWith(normalizedQuery)
  ) {
    score += 80;
  }

  if (normalizedFullName.includes(normalizedQuery)) {
    score += 60;
  }

  for (const token of normalizedTokens) {
    if (normalizedFirstName === token || normalizedLastName === token) {
      score += 40;
      continue;
    }

    if (
      normalizedFirstName.startsWith(token) ||
      normalizedLastName.startsWith(token)
    ) {
      score += 25;
      continue;
    }

    if (normalizedFullName.includes(token)) {
      score += 10;
    }
  }

  const editDistance = Math.min(
    calculateEditDistance(normalizedQuery, normalizedFullName),
    calculateEditDistance(normalizedQuery, normalizedFirstName),
    calculateEditDistance(normalizedQuery, normalizedLastName),
  );

  return { score, editDistance };
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly azureStorageService: AzureStorageService,
    private readonly userRegistrationService: UserRegistrationService,
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

    let phoneExists: User | null = null;
    if (phone) {
      phoneExists = await this.prisma.user.findUnique({
        where: {
          phone,
        },
      });
    }

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
      const arrangerId = createUuid();
      const userId = createUuid();

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
    const { name } = searchProps;
    const normalizedName = name ? normalizeWhitespace(name) : "";
    const nameTokens = normalizedName
      ? normalizedName.split(" ").filter(Boolean)
      : [];
    const tokenVariants = nameTokens.map((token) => buildSearchVariants(token));
    const normalizedTokenVariants = tokenVariants.map((variants) =>
      variants.map((variant) => normalizeSearchValue(variant)),
    );

    const users = await this.prisma.user.findMany({
      where: {
        ...(tokenVariants.length > 0 && {
          AND: tokenVariants.map((variants) => ({
            OR: variants.reduce<Array<Record<string, unknown>>>(
              (filters, variant) => [
                ...filters,
                {
                  firstName: {
                    contains: variant,
                    mode: "insensitive",
                  },
                },
                {
                  lastName: {
                    contains: variant,
                    mode: "insensitive",
                  },
                },
              ],
              [],
            ),
          })),
        }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        image: true,
        description: true,
      },
      // Relevance is computed in the service, so pagination must happen after
      // we have ranked the candidate set. The candidate set is capped so a
      // broad query (e.g. a single letter) cannot pull the whole user table
      // into memory; results beyond the cap are not reachable by ranking.
      skip: normalizedName ? undefined : skip,
      take: normalizedName ? USER_SEARCH_CANDIDATE_LIMIT : take,
    });

    if (normalizedName) {
      const normalizedQuery = normalizeSearchValue(normalizedName);
      const normalizedTokens = normalizedQuery.split(" ").filter(Boolean);

      return users
        .filter((user) => {
          const normalizedFullName = normalizeSearchValue(
            `${user.firstName} ${user.lastName}`,
          );

          return normalizedTokenVariants.every((variants) =>
            variants.some((variant) => normalizedFullName.includes(variant)),
          );
        })
        .map((user) => {
          const { score, editDistance } = scoreUserSearchMatch(
            user,
            normalizedQuery,
            normalizedTokens,
          );

          return {
            user,
            score,
            editDistance,
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.editDistance - b.editDistance ||
            a.user.firstName.localeCompare(b.user.firstName) ||
            a.user.lastName.localeCompare(b.user.lastName),
        )
        .slice(skip, skip + take)
        .map((user) => user.user);
    }

    return users;
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      include: {
        userAllergens: true,
        userSeenUpdates: true,
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

  async findForLocalAuth() {
    return await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      take: 20,
    });
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

  async rotateRefreshTokenId(userId: string) {
    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshTokenId: randomUUID(),
      },
    });
  }

  /**
   * Returns the user with a guaranteed `refreshTokenId`. Generates one only
   * if the user doesn't already have it — never rotates an existing id.
   *
   * Used by the login callbacks (Vipps, Google, dev-login) so that logging
   * in on a second device does not invalidate the refresh cookie on the
   * first one. Explicit logout still calls rotateRefreshTokenId, which is
   * what revokes all active sessions.
   *
   * The write is an atomic conditional update so concurrent first-logins
   * cannot race each other into two different ids.
   */
  async ensureRefreshTokenId(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, refreshTokenId: null },
      data: { refreshTokenId: randomUUID() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UserDoesNotExistException(userId);
    }

    return user;
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
    const allergens = updateUserDto.allergens;
    delete updateUserDto.allergens;

    try {
      return await this.prisma.$transaction(async (trx) => {
        if (allergens) {
          await trx.userAllergen.deleteMany({
            where: {
              userId: user.id,
            },
          });
          await trx.userAllergen.createMany({
            data: allergens.map((allergen) => ({
              userId: user.id,
              allergenId: allergen,
            })),
          });
        }
        return await trx.user.update({
          where: { id: user.id },
          data: {
            ...(imageFileName !== undefined && {
              image: imageFileName,
            }),
            ...updateUserDto,
          },
        });
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
      // get arranger id
      const user = await this.prisma.user.findUnique({
        where: { id },
      });
      if (!user) {
        throw new UserDoesNotExistException(id);
      }

      // Release the spots this user holds before deleting them, so waitlisted
      // attendees are promoted. This runs outside the transaction below on
      // purpose: updateRegistration opens its own transaction per event, and
      // nesting those inside an open one risks deadlocking against the very
      // rows this transaction is about to delete.
      await this.userRegistrationService.updateAllRegistrationsOfUserToNotGoing(
        user.id,
      );

      await this.prisma.$transaction(async (trx) => {
        //delete all events hosted by user
        await trx.event.deleteMany({
          where: {
            eventArrangers: {
              some: {
                arrangerId: user.arrangerId,
                role: EventArrangerRole.ADMIN,
              },
            },
          },
        });

        // delete arranger which automatically deletes user because of ON DELETE CASCADE in schema.prisma
        await trx.arranger.delete({
          where: {
            id: user.arrangerId,
          },
        });
      });

      return user;
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new UserDoesNotExistException(id);
      }

      throw error;
    }
  }

  async findUpdatesSeenByUser(userId: string) {
    const res = await this.prisma.userSeenUpdate.findMany({
      where: {
        userId,
      },
    });

    return res.map((r) => r.update);
  }

  async userSeenUpdate(userId: string, update: UserSeenUpdateType) {
    const res = await this.prisma.userSeenUpdate.findUnique({
      where: {
        userId_update: {
          userId,
          update,
        },
      },
    });

    if (res) {
      return true;
    }
    return false;
  }

  async markUserSeenUpdate(userId: string, update: UserSeenUpdateType) {
    const res = await this.prisma.userSeenUpdate.upsert({
      where: {
        userId_update: {
          userId,
          update,
        },
      },
      create: {
        userId,
        update,
      },
      update: {},
    });

    return res;
  }
}
