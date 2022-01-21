import { ConflictException } from "@nestjs/common";

export class DuplicateRegistrationException extends ConflictException {
  constructor(event_id: string, user_id: string) {
    super({
      message: `User ${user_id} is allready registered at event ${event_id}`,
    });
  }
}
