import { Body, Controller, Get, Post } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { CategorizeEventDto } from "./dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  async createCategory(@Body() categorizeEventDto: CategorizeEventDto) {
    return this.categoriesService.categorizeEvent(categorizeEventDto);
  }
}
