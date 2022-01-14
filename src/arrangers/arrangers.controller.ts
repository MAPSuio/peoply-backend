import { Controller, Get, Param } from "@nestjs/common";
import { ArrangersService } from "./arrangers.service";

@Controller("arrangers")
export class ArrangersController {
  constructor(private readonly arrangersService: ArrangersService) {}

  @Get()
  async findAll() {
    return this.arrangersService.findAll();
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.arrangersService.findOne(id);
  }
}
