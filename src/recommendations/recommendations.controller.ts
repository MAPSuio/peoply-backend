import { Public } from "../auth/public.decorator";
import { Controller, Get, Query, Req, UseInterceptors } from "@nestjs/common";
import { AuthenticatedInterceptor } from "../auth/interceptors/authenticated.interceptor";
import { User } from "../generated/prisma/client";
import { SearchRecommendationsDto } from "./dto";
import { RecommendationsService } from "./recommendations.service";

@Controller("recommendations")
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  /* Public endpoints: logged-in users get personalized results, anonymous
   * visitors get the popularity-based ranking. */

  @Public()
  @Get("events")
  @UseInterceptors(AuthenticatedInterceptor)
  async findEvents(@Req() req: any, @Query() query: SearchRecommendationsDto) {
    const user: User | undefined = req.user;
    return this.recommendationsService.recommendEvents(user?.id, query.take);
  }

  @Public()
  @Get("organizations")
  @UseInterceptors(AuthenticatedInterceptor)
  async findOrganizations(
    @Req() req: any,
    @Query() query: SearchRecommendationsDto,
  ) {
    const user: User | undefined = req.user;
    return this.recommendationsService.recommendOrganizations(
      user?.id,
      query.take,
    );
  }
}
