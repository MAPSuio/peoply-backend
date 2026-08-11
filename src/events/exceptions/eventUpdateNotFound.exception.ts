import { NotFoundException } from "@nestjs/common";

export class EventUpdateNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(`No update with id: ${id} exists on this event`);
  }
}
