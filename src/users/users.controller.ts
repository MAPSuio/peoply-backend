import {
  BadRequestException,
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
import { AuthenticatedGuard, UserIdVerificationGuard } from "../auth/guards";
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
import { User, UserSeenUpdateType } from "../generated/prisma/client";
import { EventArrangersService } from "../arrangers/services";
import { OrganizationsService } from "../organizations/organizations.service";
import { SearchUserDto } from "./dto/search-user.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { AuthService } from "../auth/auth.service";

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
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Get("me")
  async me(@Req() req: any) {
    return withoutRefreshTokenId(req.user);
  }

  @UseGuards(AuthenticatedGuard)
  @UseInterceptors(
    FileInterceptor("profileImage", {
      fileFilter: (req, file, callback) => {
        if (file.mimetype !== "image/jpeg" && file.mimetype !== "image/png") {
          callback(
            new BadRequestException("Only .jpeg and .png files are allowed!"),
            false,
          );
        } else {
          callback(null, true);
        }
      },
      limits: {
        // filesize limit 50 MB
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  @Patch("me")
  async updateUser(
    @Req() req: any,
    @Body() data: UpdateUserDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    const user: User = req.user;
    return this.userService.update(user, data, profileImage);
  }

  @UseGuards(AuthenticatedGuard)
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

  @UseGuards(AuthenticatedGuard)
  @Get()
  async findAll(@Query() query: SearchUserDto) {
    const { skip, take } = query;
    return this.userService.findAll(query, skip, take);
  }

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

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Get(":userId/registrations")
  async getRegistrations(
    @Req() req: any,
    @Query() query: SearchUserRegistrationDto,
    @Param("userId") id: string,
  ) {
    return this.userRegistrationService.findAll(
      query,
      id,
      query.skip,
      query.take,
    );
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
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

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
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

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Patch(":userId/registrations")
  async updateRegistration(
    @Param("userId") id: string,
    @Body() dto: UserUpdateRegistrationDto,
  ) {
    // TODO check if the event exists
    return this.userRegistrationService.update(id, dto);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Post(":userId/registrations")
  async createRegistration(
    @Param("userId") id: string,
    @Body() dto: CreateRegistrationDto,
  ) {
    // TODO check if the event exists
    return this.userRegistrationService.create(id, dto);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Post(":userId/favorites")
  async makeFavorite(@Param("userId") id: string, @Body() dto: UuidDto) {
    return this.userFavoritesService.create(id, dto.id);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Get(":userId/favorites")
  async getFavorites(
    @Query() query: SearchFavoritesDto,
    @Param("userId") id: string,
  ) {
    return this.userFavoritesService.findAll(query, id);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
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

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Delete(":userId/favorites")
  async deleteFavorite(@Body() dto: UuidDto, @Param("userId") userId: string) {
    return await this.userFavoritesService.remove(userId, dto.id);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Get(":userId/arranging")
  async getArrangedEvents(@Req() req: any) {
    const user: User = req.user;
    return this.eventArrangersService.findAllWithEventsArrangedByUserAndOrganizationsOfUser(
      user.id,
    );
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Get(":userId/organizations")
  async getOrganizations(@Req() req: any, @Param("userId") userId: string) {
    /* gets all orgs that user is admin for
    Args:
      userId: id of user
    Returns:
      list of orgs
    */
    return this.organizationsService.findOrgsByUserIdAndRole(userId);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Get(":userId/notifications")
  async getNotifications(@Param("userId") userId: string) {
    return this.notificationsService.findAllPendingByUserId(userId);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Get(":userId/following")
  async getFollowing(@Param("userId") userId: string) {
    return this.followService.findAll(userId);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Post(":userId/following/:arrangerId")
  async followArranger(
    @Param("userId") userId: string,
    @Param("arrangerId") arrangerId: string,
  ) {
    return this.followService.follow(userId, arrangerId);
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Delete(":userId/following/:arrangerId")
  async unFollowArranger(
    @Param("userId") userId: string,
    @Param("arrangerId") arrangerId: string,
  ) {
    return this.followService.unFollow(userId, arrangerId);
  }

  @UseGuards(AuthenticatedGuard)
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

  @UseGuards(AuthenticatedGuard)
  @Get("me/seenUpdates")
  async seenUpdates(@Req() req: any) {
    const user: User = req.user;
    return this.userService.findUpdatesSeenByUser(user.id);
  }
  @UseGuards(AuthenticatedGuard)
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
