import { Public } from "../auth/public.decorator";
import { Controller, Get } from "@nestjs/common";
import { BROWSER_CACHE_TTL, BrowserCacheFor } from "../util/browser-cache";
import { CategoriesService } from "./categories.service";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @BrowserCacheFor(BROWSER_CACHE_TTL.referenceTables)
  async findAll() {
    return this.categoriesService.findAll();
  }
}
