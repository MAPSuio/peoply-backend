import { NotFoundException } from "@nestjs/common";

export class EventNotFoundException extends NotFoundException {
  constructor(id: number) {
    super(`No event with ${id} exists`);
  }
}
