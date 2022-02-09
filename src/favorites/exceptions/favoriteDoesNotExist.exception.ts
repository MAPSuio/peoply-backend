import { NotFoundException } from "@nestjs/common";

export class FavoriteDoesNotExistException extends NotFoundException {
  constructor(userId: string, eventId: string) {
    super({
      message: `No favorite with userId ${userId} has event ${eventId} as a favorite`,
    });
  }
}
