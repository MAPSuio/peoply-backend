import { NotFoundException } from "@nestjs/common";

export class ArrangerNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`No arranger with ${id} exists`);
  }
}
