import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import { SearchFavoritesDto } from "../favorites/dto/search-favorites.dto";
import { FavoritesService } from "../favorites/favorites.service";
import {
  CreateRegistrationDto,
  DeleteRegistrationDto,
  SearchUserRegistrationDto,
  UserUpdateRegistrationDto,
} from "../registrations/dto";
import { UserRegistrationService } from "../registrations/services";
import { Response } from "express";
import { UuidDto } from "../genericDTOs/uuid.dto";
import { UpdateUserDto } from "./dto";
import { UsersService } from "./users.service";
import { UserDoesNotExistException } from "./exceptions";
import { FileInterceptor } from "@nestjs/platform-express";
import { User } from ".prisma/client";
import { EventArrangersService } from "../arrangers/services";
import { OrganizationsService } from "../organizations/organizations.service";
@Controller("users")
export class UsersController {
  constructor(
    private readonly userRegistrationService: UserRegistrationService,
    private readonly userFavoritesService: FavoritesService,
    private readonly userService: UsersService,
    private readonly eventArrangersService: EventArrangersService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Get("me")
  async me(@Req() req: any) {
    return req.user;
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
    return this.userService.update(user.id, data, profileImage);
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

  @UseGuards(AuthenticatedGuard)
  @Get(":id/registrations")
  async getRegistrations(
    @Req() req: any,
    @Query() query: SearchUserRegistrationDto,
    @Param("id") id: string,
  ) {
    const user: User = req.user;
    if (id === user.id) {
      return this.userRegistrationService.findAll(query, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":userId/registrations/:eventId")
  async getSingleRegistrations(
    @Req() req: any,
    @Query() query: SearchUserRegistrationDto,
    @Param("userId") userId: string,
    @Param("eventId") eventId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user: User = req.user;
    if (userId === user.id) {
      const registration = await this.userRegistrationService.findOne(
        eventId,
        userId,
      );
      //the registration does not exist
      if (!registration) {
        res.status(HttpStatus.NO_CONTENT);
      }
      return registration;
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Patch(":id/registrations")
  async updateRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UserUpdateRegistrationDto,
  ) {
    const user: User = req.user;
    if (id === user.id) {
      // TODO check if the event exists
      return this.userRegistrationService.update(id, dto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to manipulate the registration for this user",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Post(":id/registrations")
  async createRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CreateRegistrationDto,
  ) {
    const user: User = req.user;
    if (id === user.id) {
      // TODO check if the event exists
      return this.userRegistrationService.create(id, dto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to register this user",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(":id/registrations")
  async deleteRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: DeleteRegistrationDto,
  ) {
    const user: User = req.user;
    if (id === user.id) {
      // TODO check if the event exists
      return this.userRegistrationService.remove(dto.eventId, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to delete the registration for this user",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Post(":id/favorites")
  async makeFavorite(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UuidDto,
  ) {
    const user: User = req.user;
    if (id === user.id) {
      return this.userFavoritesService.create(id, dto.id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to add a favorite for this user",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":id/favorites")
  async getFavorites(
    @Req() req: any,
    @Query() query: SearchFavoritesDto,
    @Param("id") id: string,
  ) {
    const user: User = req.user;
    if (id === user.id) {
      return this.userFavoritesService.findAll(query, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":userId/favorites/:eventId")
  async getSpecificFavorite(
    @Req() req: any,
    @Param("userId") userId: string,
    @Param("eventId") eventId: string,
    @Res({ passthrough: true }) res: Response, //passthrough is enabeled to allow both express and nestjs(next) handlers
  ) {
    const user: User = req.user;
    if (userId === user.id) {
      const favorite = await this.userFavoritesService.findOne(userId, eventId);

      if (!favorite) {
        res.status(HttpStatus.NO_CONTENT);
      }

      return favorite;
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(":userId/favorites")
  async deleteFavorite(
    @Req() req: any,
    @Body() dto: UuidDto,
    @Param("userId") userId: string,
  ) {
    const user: User = req.user;
    if (userId === user.id) {
      return await this.userFavoritesService.remove(userId, dto.id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see delete this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":userId/arranging")
  async getArrangedEvents(@Req() req: any, @Param("userId") id: string) {
    const user: User = req.user;
    if (id === user.id) {
      return this.eventArrangersService.findAllWithEvents(user.arrangerId);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see what this arranger is arranging",
      );
    }
  }
  @UseGuards(AuthenticatedGuard)
  @Get(":userId/organizations")
  async getOrganizations(@Req() req: any, @Param("userId") userId: string) {
    /* gets all orgs that user is admin for
    Args:
      userId: id of user
    Returns:
      list of orgs
    */
    const user: User = req.user;
    if (userId === user.id) {
      return this.organizationsService.findOrgsByUserIdAndRole(user.id);
    }
  }
}
