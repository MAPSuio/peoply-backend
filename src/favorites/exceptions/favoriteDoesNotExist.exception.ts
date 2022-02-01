import { NotFoundException } from "@nestjs/common";

export class FavoriteDoesNotExistException extends NotFoundException {
  constructor(user_id: string, event_id: string) {
    super({
      message: `No favorite with user_id ${user_id} has event ${event_id} as a favorite`,
    });
  }
}
