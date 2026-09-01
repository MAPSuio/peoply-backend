import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  OrganizationRole,
  Provider,
  User,
} from "../../generated/prisma/client";
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
import {
  EventArrangerRole,
  UserSeenUpdateType,
} from "../../generated/prisma/client";
import { UserRegistrationService } from "../../registrations/services";
import { createUuid } from "../../util/uuid";
import { DEFAULT_SEARCH_PAGE_SIZE, MAX_PAGE_SIZE } from "../../util/pagination";
import {
  PUBLIC_USER_PROFILE_SELECT,
  type PublicUserProfile,
} from "../user.select";
import { ALL_ROWS } from "../../util/pagination";

/**
 * Upper bound on the number of rows a name search may load for in-memory
 * ranking. Derived from MAX_PAGE_SIZE rather than hardcoded: ranking happens
 * after the query, so the candidate set has to stay well above the largest
 * page a client may ask for, or the best matches never reach the page.
 */
const USER_SEARCH_CANDIDATE_LIMIT = MAX_PAGE_SIZE * 5;

const isDuplicateUniqueValue = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === PrismaError.DuplicateUniqueValue;

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
  private readonly logger = new Logger(UsersService.name);

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
        // Both arms of the branch this replaces rethrew, so the only thing it
        // did was note the collision. Kept as a real log line: a duplicate on
        // a freshly generated uuid is worth knowing about.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === PrismaError.DuplicateUniqueValue
        ) {
          this.logger.error(
            `uuid collision while creating a user for provider ${provider}`,
          );
        }
        throw error;
      }
    }
  }

  async findAll(searchProps: SearchUserDto = {}) {
    const { name, skip = 0, take = DEFAULT_SEARCH_PAGE_SIZE } = searchProps;
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
      select: PUBLIC_USER_PROFILE_SELECT,
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

  async findPublicProfileById(id: string): Promise<PublicUserProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_PROFILE_SELECT,
    });
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

  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({ where: { email } });
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

  async getLinkedProviders(userId: string) {
    return this.prisma.providerUser.findMany({
      where: { id: userId },
      select: { provider: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  /**
   * Attaches a provider identity to an existing user. The caller is
   * responsible for having proven ownership of both sides — the identity by
   * the OIDC login itself, the user by their session or a confirm re-auth.
   *
   * A Vipps profile backfills phone and birthDate onto accounts that lack
   * them (Google supplies neither), but never overwrites, and leaves phone
   * alone when the number already belongs to someone else — a link must not
   * fail or steal data over a column that is merely nice to have.
   */
  async linkProvider(
    userId: string,
    provider: Provider,
    sub: string,
    profile?: CreateUserDto,
  ) {
    try {
      await this.prisma.providerUser.create({
        data: { provider, sub, id: userId },
      });
    } catch (error) {
      /* Raced double-links and "this account already holds an identity from
         that provider" both land here via the unique indexes — conflicts the
         caller can explain, not internal errors. */
      if (isDuplicateUniqueValue(error)) {
        throw new ConflictException("Provider already linked");
      }
      throw error;
    }

    /* Deliberately after — not inside a transaction with — the link: the
       backfill is best-effort, and losing a race for the phone number must
       neither roll the link back nor masquerade as "Provider already
       linked". */
    if (provider === Provider.VIPPS && profile) {
      await this.backfillVippsProfile(userId, profile);
    }
  }

  /** The profile fields a Vipps link may fill in, never overwrite or steal. */
  private async backfillVippsProfile(userId: string, profile: CreateUserDto) {
    const backfill = await this.vippsBackfillValues(userId, profile);

    if (Object.keys(backfill).length === 0) {
      return;
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data: backfill });
    } catch (error) {
      if (!isDuplicateUniqueValue(error)) {
        throw error;
      }
      // Somebody claimed the phone between the check and the write. The
      // field stays empty; the link itself already succeeded.
      this.logger.warn(
        `Skipped profile backfill for user ${userId}: value already in use`,
      );
    }
  }

  private async vippsBackfillValues(userId: string, profile: CreateUserDto) {
    const backfill: { phone?: string; birthDate?: string } = {};

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return backfill;
    }

    if (!user.phone && profile.phone) {
      const phoneOwner = await this.prisma.user.findUnique({
        where: { phone: profile.phone },
      });
      if (!phoneOwner) backfill.phone = profile.phone;
    }

    if (!user.birthDate && profile.birthDate) {
      backfill.birthDate = profile.birthDate;
    }

    return backfill;
  }

  async unlinkProvider(userId: string, provider: Provider) {
    await this.prisma.$transaction(async (trx) => {
      /* Count-then-delete runs at READ COMMITTED, so two concurrent unlinks
         of DIFFERENT providers would both count 2, delete different rows and
         commit — leaving zero login methods and a permanently locked-out
         account. Locking the user row serializes unlinks per user. */
      await trx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

      const linked = await trx.providerUser.count({ where: { id: userId } });

      // Zero rows is "nothing to unlink", not "you would lock yourself out".
      if (linked === 0) {
        throw new NotFoundException(`${provider} is not linked to this user`);
      }

      /* There is no password fallback: the provider rows are the only way
         into the account, so the last one must stay. */
      if (linked === 1) {
        throw new ForbiddenException(
          "Cannot remove the last login method of an account",
        );
      }

      const { count } = await trx.providerUser.deleteMany({
        where: { id: userId, provider },
      });

      if (count === 0) {
        throw new NotFoundException(`${provider} is not linked to this user`);
      }
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
    /* the new image and its colors if one is provided, nulls if removeImage,
       and undefined if the column should be left alone */
    const imageChange = await this.azureStorageService.swapImage({
      ownerId: user.id,
      currentImageUrl: user.image,
      newImage: profileImage,
      removeImage: updateUserDto.removeImage,
      container: AzureStorageContainer.PROFILE_IMAGES,
      conflictMessage: "The profile image must either be removed or added",
    });

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
            ...(imageChange !== undefined && {
              image: imageChange.image,
            }),
            ...updateUserDto,
          },
        });
      });
    } catch (error) {
      // Kept for the cleanup only: the image is uploaded before the update,
      // so a failure would leave it orphaned.
      if (imageChange?.image) {
        await this.azureStorageService.deleteUploadedImageQuietly(
          imageChange.image,
          AzureStorageContainer.PROFILE_IMAGES,
          "User update",
        );
      }

      throw error;
    }
  }

  async remove(id: string) {
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

    // The catch this replaces tested for P2001, which the arranger delete
    // below does not raise — a missing row raises P2025. Deleting an already
    // deleted user answered 500 instead of 404.
    await this.prisma.$transaction(async (trx) => {
      await this.reassignOwnedOrganizations(trx, user.id);

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
  }

  /**
   * Hands on every organization this user is the sole OWNER of, before the
   * cascade takes their role rows with them.
   *
   * `OrganizationsController` keeps the "an organization always has an owner"
   * invariant in three places - `"You can't delete the owner"`,
   * `"Cannot change to owner"`, `"Cannot change role of owner"` - and account
   * deletion went around all of them. Deleting the arranger cascades to the
   * user and on to `UserOrganizationRole`, but the organization has its own
   * arranger and survives. Since `PATCH /:orgId/roles` refuses to grant OWNER
   * and `PATCH /:orgId/owner` requires being one, nobody could ever be promoted
   * again: the organization, its events and its ICS feed stayed live with
   * nobody able to edit or remove them.
   *
   * Successor is the longest-standing ADMIN, then the longest-standing MEMBER.
   * An organization with no other members at all has nobody to hand it to and
   * is deleted with the account.
   */
  private async reassignOwnedOrganizations(
    trx: Prisma.TransactionClient,
    userId: string,
  ) {
    const ownedOrganizations = await trx.userOrganizationRole.findMany({
      take: ALL_ROWS,
      where: { userId, role: OrganizationRole.OWNER },
      select: { organizationId: true },
    });

    for (const { organizationId } of ownedOrganizations) {
      /* Ordered so ADMIN comes before MEMBER, and within a role the one who
         has been there longest wins. `role` is an enum, so this relies on the
         declaration order in the schema (ADMIN, MEMBER) rather than on the
         alphabet - hence the explicit find below rather than taking [0]. */
      const candidates = await trx.userOrganizationRole.findMany({
        take: ALL_ROWS,
        where: { organizationId, userId: { not: userId } },
        select: { userId: true, role: true },
        orderBy: { createdAt: "asc" },
      });

      const successor =
        candidates.find(({ role }) => role === OrganizationRole.ADMIN) ??
        candidates.find(({ role }) => role === OrganizationRole.MEMBER);

      if (!successor) {
        /* Nobody left to hand it to. Leaving it would strand the organization
           exactly as before, so it goes with the account. */
        await trx.organization.delete({ where: { id: organizationId } });
        this.logger.warn(
          `Deleted organization ${organizationId}: its only owner deleted their account and it had no other members`,
        );
        continue;
      }

      await trx.userOrganizationRole.update({
        where: {
          organizationId_userId: { organizationId, userId: successor.userId },
        },
        data: { role: OrganizationRole.OWNER },
      });
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
