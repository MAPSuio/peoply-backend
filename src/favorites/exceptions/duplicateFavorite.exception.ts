import { ConflictException } from "@nestjs/common";

export class DuplicateFavoriteException extends ConflictException {
  constructor(event_id: string, user_id: string) {
    super({
      message: `User ${user_id} is allready has event ${event_id} as a favorite`,
    });
  }
}
