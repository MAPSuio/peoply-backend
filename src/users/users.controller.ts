import { Public } from "../auth/public.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { UserIdVerificationGuard } from "../auth/guards";
import { SearchFavoritesDto } from "../favorites/dto/search-favorites.dto";
import { FavoritesService } from "../favorites/favorites.service";
import {
  CreateRegistrationDto,
  SearchUserRegistrationDto,
  UserUpdateRegistrationDto,
} from "../registrations/dto";
import { UserRegistrationService } from "../registrations/services";
import { Response } from "express";
import { UuidDto } from "../genericDTOs/uuid.dto";
import { UpdateUserDto } from "./dto";
import { UsersService, FollowService } from "./services";
import { UserDoesNotExistException } from "./exceptions";
import { withoutRefreshTokenId } from "./user.response";
import { FileInterceptor } from "@nestjs/platform-express";
import { imageUploadOptionsFor } from "../azure/image-upload";
import { Provider, User, UserSeenUpdateType } from "../generated/prisma/client";
import { EventArrangersService } from "../arrangers/services";
import { OrganizationsService } from "../organizations/organizations.service";
import { SearchUserDto } from "./dto/search-user.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { AuthService } from "../auth/auth.service";
import { AdministrationService } from "../administration/administration.service";
import { PaginationDto } from "../util/pagination.dto";

@Controller("users")
export class UsersController {
  constructor(
    private readonly userRegistrationService: UserRegistrationService,
    private readonly userFavoritesService: FavoritesService,
    private readonly userService: UsersService,
    private readonly eventArrangersService: EventArrangersService,
    private readonly organizationsService: OrganizationsService,
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthService,
    private readonly followService: FollowService,
    private readonly administrationService: AdministrationService,
  ) {}

  @Get("me")
  async me(@Req() req: any) {
    const [permissions, providers] = await Promise.all([
      this.administrationService.getPermissions(req.user.id),
      // Self view only: the settings page decides link/unlink affordances
      // from this. PUBLIC_USER_SELECT deliberately stays provider-free.
      this.userService.getLinkedProviders(req.user.id),
    ]);

    return {
      ...withoutRefreshTokenId(req.user),
      ...permissions,
      providers,
    };
  }

  /**
   * Unlinking is reversible by design — relinking is one OIDC round trip in
   * settings — but the service refuses to remove the last provider: with no
   * password fallback that would be a permanent lockout, not an unlink.
   */
  @Delete("me/providers/:provider")
  async unlinkProvider(
    @Req() req: any,
    @Param("provider", new ParseEnumPipe(Provider)) provider: Provider,
  ) {
    this.authService.assertTrustedOrigin(req.headers, {
      allowMissingOrigin: true,
    });

    await this.userService.unlinkProvider(req.user.id, provider);
  }

  @UseInterceptors(
    FileInterceptor("profileImage", imageUploadOptionsFor(UpdateUserDto)),
  )
  @Patch("me")
  async updateUser(
    @Req() req: any,
    @Body() data: UpdateUserDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    const user: User = req.user;
    // The row Prisma hands back from `update` is the full record, so the same
    // subtraction GET /users/me applies has to happen here too — otherwise
    // saving the settings page is enough to read the session handle back out.
    return withoutRefreshTokenId(
      await this.userService.update(user, data, profileImage),
    );
  }

  @Delete("me")
  async deleteUser(@Req() req: any, @Res() res: Response) {
    await this.userService.remove(req.user.id);

    // delete access and refresh tokens
    const accessCookieOptions = this.authService.getAccessCookieOptions();
    const refreshCookieOptions = this.authService.getRefreshCookieOptions();

    res.clearCookie("refresh", refreshCookieOptions);
    res.clearCookie("access", accessCookieOptions);

    return res.sendStatus(200);
  }

  @Get()
  async findAll(@Query() query: SearchUserDto) {
    return this.userService.findAll(query);
  }

  @Public()
  @Get(":id")
  async getUser(@Param("id") id: string) {
    const user = await this.userService.findById(id);

    if (!user) {
      throw new UserDoesNotExistException(id);
    }

    /* extract non-sensitive data */
    return (({ id, firstName, lastName, image, description }) => ({
      id,
      firstName,
      lastName,
      image,
      description,
    }))(user);
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/registrations")
  async getRegistrations(
    @Req() req: any,
    @Query() query: SearchUserRegistrationDto,
    @Param("userId") id: string,
  ) {
    return this.userRegistrationService.findAll(query, id);
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/registrations/:eventId")
  async getSingleRegistrations(
    @Param("userId") userId: string,
    @Param("eventId") eventId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const registration = await this.userRegistrationService.findOne(
      eventId,
      userId,
    );
    //the registration does not exist
    if (!registration) {
      res.status(HttpStatus.NO_CONTENT);
    }
    return registration;
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/registrations/:eventId/waitlist-position")
  async getWaitlistPosition(
    @Param("userId") userId: string,
    @Param("eventId") eventId: string,
  ) {
    const registration = await this.userRegistrationService.findOne(
      eventId,
      userId,
    );
    //the registration does not exist
    if (!registration) {
      throw new NotFoundException();
    }

    return this.userRegistrationService.getPositionInWaitlist(eventId, userId);
  }

  @UseGuards(UserIdVerificationGuard)
  @Patch(":userId/registrations")
  async updateRegistration(
    @Param("userId") id: string,
    @Body() dto: UserUpdateRegistrationDto,
  ) {
    // TODO check if the event exists
    return this.userRegistrationService.update(id, dto);
  }

  @UseGuards(UserIdVerificationGuard)
  @Post(":userId/registrations")
  async createRegistration(
    @Param("userId") id: string,
    @Body() dto: CreateRegistrationDto,
  ) {
    // TODO check if the event exists
    return this.userRegistrationService.create(id, dto);
  }

  @UseGuards(UserIdVerificationGuard)
  @Post(":userId/favorites")
  async makeFavorite(@Param("userId") id: string, @Body() dto: UuidDto) {
    return this.userFavoritesService.create(id, dto.id);
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/favorites")
  async getFavorites(
    @Query() query: SearchFavoritesDto,
    @Param("userId") id: string,
  ) {
    return this.userFavoritesService.findAll(query, id);
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/favorites/:eventId")
  async getSpecificFavorite(
    @Param("userId") userId: string,
    @Param("eventId") eventId: string,
    @Res({ passthrough: true }) res: Response, //passthrough is enabeled to allow both express and nestjs(next) handlers
  ) {
    const favorite = await this.userFavoritesService.findOne(userId, eventId);

    if (!favorite) {
      res.status(HttpStatus.NO_CONTENT);
    }
    return favorite;
  }

  @UseGuards(UserIdVerificationGuard)
  @Delete(":userId/favorites")
  async deleteFavorite(@Body() dto: UuidDto, @Param("userId") userId: string) {
    return await this.userFavoritesService.remove(userId, dto.id);
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/arranging")
  async getArrangedEvents(@Req() req: any, @Query() page: PaginationDto) {
    const user: User = req.user;
    return this.eventArrangersService.findAllWithEventsArrangedByUserAndOrganizationsOfUser(
      user.id,
      page,
    );
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/organizations")
  async getOrganizations(
    @Param("userId") userId: string,
    @Query() page: PaginationDto,
  ) {
    /* gets all orgs that user is admin for
    Args:
      userId: id of user
      page: skip/take bounds for the returned page
    Returns:
      list of orgs
    */
    return this.organizationsService.findOrgsByUserIdAndRole(
      userId,
      undefined,
      page,
    );
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/notifications")
  async getNotifications(
    @Param("userId") userId: string,
    @Query() page: PaginationDto,
  ) {
    return this.notificationsService.findAllPendingByUserId(userId, page);
  }

  @UseGuards(UserIdVerificationGuard)
  @Get(":userId/following")
  async getFollowing(
    @Param("userId") userId: string,
    @Query() page: PaginationDto,
  ) {
    return this.followService.findAll(userId, page);
  }

  @UseGuards(UserIdVerificationGuard)
  @Post(":userId/following/:arrangerId")
  async followArranger(
    @Param("userId") userId: string,
    @Param("arrangerId") arrangerId: string,
  ) {
    return this.followService.follow(userId, arrangerId);
  }

  @UseGuards(UserIdVerificationGuard)
  @Delete(":userId/following/:arrangerId")
  async unFollowArranger(
    @Param("userId") userId: string,
    @Param("arrangerId") arrangerId: string,
  ) {
    return this.followService.unFollow(userId, arrangerId);
  }

  @Get("me/seenUpdate/:update")
  async seenUpdate(
    @Req() req: any,
    /* An unknown value used to reach Prisma's enum and come back as a
       500; ParseEnumPipe turns it into the 400 it always was. */
    @Param("update", new ParseEnumPipe(UserSeenUpdateType))
    update: UserSeenUpdateType,
  ) {
    const user: User = req.user;
    return this.userService.userSeenUpdate(user.id, update);
  }

  @Get("me/seenUpdates")
  async seenUpdates(@Req() req: any) {
    const user: User = req.user;
    return this.userService.findUpdatesSeenByUser(user.id);
  }
  @Post("me/seenUpdate/:update")
  async markUserSeenUpdate(
    @Req() req: any,
    /* An unknown value used to reach Prisma's enum and come back as a
       500; ParseEnumPipe turns it into the 400 it always was. */
    @Param("update", new ParseEnumPipe(UserSeenUpdateType))
    update: UserSeenUpdateType,
  ) {
    const user: User = req.user;
    return this.userService.markUserSeenUpdate(user.id, update);
  }
}
