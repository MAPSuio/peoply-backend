import { NotFoundException } from "@nestjs/common";

export class ForeignKeyNotFoundException extends NotFoundException {
  constructor(eventId: string, userId: string) {
    super(`EventId ${eventId} or userId ${userId} does not exists`);
  }
}
