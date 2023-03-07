import { Controller, Get } from "@nestjs/common";
import { AllergensService } from "./allergens.service";

@Controller("allergens")
export class AllergensController {
  constructor(private readonly allergensService: AllergensService) {}

  @Get()
  async findAll() {
    return await this.allergensService.findAll();
  }
}
