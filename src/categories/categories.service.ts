import { Injectable } from "@nestjs/common";
import { EventNotFoundException } from "../events/exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { CategorizeEventDto } from "./dto";
import { CategoryNotFoundException } from "./exceptions";

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany();
  }

  /* ties categories to an event - categories are replaced, not added */
  async categorizeEvent({ categories, eventId }: CategorizeEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    }); // TODO: refactor to use eventService

    if (event) {
      /* fetch readable category names */
      const selectedCategories = await this.prisma.category.findMany({
        where: { id: { in: categories } },
      });

      if (selectedCategories.length !== categories.length) {
        throw new CategoryNotFoundException();
      }
      /* delete all existing categories for event - then add new */
      this.prisma.$transaction([
        this.prisma.eventCategory.deleteMany({ where: { eventId } }),
        this.prisma.eventCategory.createMany({
          data: selectedCategories.map(({ id }) => ({
            categoryId: id,
            eventId,
          })),
        }),
      ]);
    } else {
      throw new EventNotFoundException();
    }
  }
}
