import { NotFoundException } from "@nestjs/common";

export class CategoryNotFoundException extends NotFoundException {
  constructor() {
    super(`One or more categories do not exist`);
  }
}
