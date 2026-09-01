import { Public } from "../auth/public.decorator";
import { Controller, Get } from "@nestjs/common";
import { BROWSER_CACHE_TTL, BrowserCacheFor } from "../util/browser-cache";
import { AllergensService } from "./allergens.service";

@Controller("allergens")
export class AllergensController {
  constructor(private readonly allergensService: AllergensService) {}

  @Public()
  @Get()
  @BrowserCacheFor(BROWSER_CACHE_TTL.referenceTables)
  async findAll() {
    return await this.allergensService.findAll();
  }
}
