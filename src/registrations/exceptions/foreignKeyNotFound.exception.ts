import { NotFoundException } from "@nestjs/common";

export class ForeignKeyNotFoundException extends NotFoundException {
  constructor(event_id: number, user_id: string) {
    super(`Event_id ${event_id} or user_id ${user_id} does not exists`);
  }
}
