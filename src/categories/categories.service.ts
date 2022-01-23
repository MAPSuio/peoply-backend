import { Injectable } from "@nestjs/common";
import { EventNotFoundException } from "../events/exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { CategorizeEventDto } from "./dto";
import { CategoryNotFoundException } from "./exceptions";

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.categories.findMany();
  }

  /* ties categories to an event - categories are replaced, not added */
  async categorizeEvent({ categories, event_id }: CategorizeEventDto) {
    const event = await this.prisma.events.findUnique({
      where: { event_id },
    }); // TODO: refactor to use eventService

    if (event) {
      /* fetch readable category names */
      const selectedCategories = await this.prisma.categories.findMany({
        where: { category_id: { in: categories } },
      });

      if (selectedCategories.length !== categories.length) {
        throw new CategoryNotFoundException();
      }
      /* delete all existing categories for event - then add new */
      this.prisma.$transaction([
        this.prisma.event_categories.deleteMany({ where: { event_id } }),
        this.prisma.event_categories.createMany({
          data: selectedCategories.map(({ category_id }) => ({
            category_id,
            event_id,
          })),
        }),
      ]);
    } else {
      throw new EventNotFoundException();
    }
  }
}
