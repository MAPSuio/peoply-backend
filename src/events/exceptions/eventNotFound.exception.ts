import { NotFoundException } from "@nestjs/common";

export class EventNotFoundException extends NotFoundException {
  constructor(id: number) {
    super(`Event not found. event_id: ${id}`);
  }
}
