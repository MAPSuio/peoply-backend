import { ConflictException } from "@nestjs/common";

export class DuplicateFavoriteException extends ConflictException {
  constructor(eventId: string, userId: string) {
    super({
      message: `User ${userId} is allready has event ${eventId} as a favorite`,
    });
  }
}
