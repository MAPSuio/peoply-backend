import { NotFoundException } from "@nestjs/common";

export class EventNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(`No event with id: ${id} exists`);
  }
}
