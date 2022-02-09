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

@Controller("users")
export class UsersController {
  constructor(
    private readonly userRegistrationService: UserRegistrationService,
    private readonly userFavoritesService: FavoritesService,
    private readonly userService: UsersService,
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
    const { user_id } = req.user;
    return this.userService.update(user_id, data, profileImage);
  }

  @Get(":id")
  async getUser(@Param("id") id: string) {
    const user = await this.userService.findById(id);

    if (!user) {
      throw new UserDoesNotExistException(id);
    }

    /* extract non-sensitive data */
    return (({ user_id, first_name, last_name, image, description }) => ({
      user_id,
      first_name,
      last_name,
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
    if (id === req.user.user_id) {
      return this.userRegistrationService.findAll(query, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":user_id/registrations/:event_id")
  async getSingleRegistrations(
    @Req() req: any,
    @Query() query: SearchUserRegistrationDto,
    @Param("user_id") user_id: string,
    @Param("event_id") event_id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user_id === req.user.user_id) {
      const registration = await this.userRegistrationService.findOne(
        event_id,
        user_id,
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
    if (id === req.user.user_id) {
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
    if (id === req.user.user_id) {
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
    if (id === req.user.user_id) {
      // TODO check if the event exists
      return this.userRegistrationService.remove(dto.event_id, id);
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
    if (id === req.user.user_id) {
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
    if (id === req.user.user_id) {
      return this.userFavoritesService.findAll(query, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":user_id/favorites/:event_id")
  async getSpecificFavorite(
    @Req() req: any,
    @Param("user_id") user_id: string,
    @Param("event_id") event_id: string,
    @Res({ passthrough: true }) res: Response, //passthrough is enabeled to allow both express and nestjs(next) handlers
  ) {
    if (user_id === req.user.user_id) {
      const favorite = await this.userFavoritesService.findOne(
        user_id,
        event_id,
      );

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
  @Delete(":user_id/favorites")
  async deleteFavorite(
    @Req() req: any,
    @Body() dto: UuidDto,
    @Param("user_id") user_id: string,
  ) {
    if (user_id === req.user.user_id) {
      return await this.userFavoritesService.remove(req.user.user_id, dto.id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to see delete this users registrations",
      );
    }
  }
}
