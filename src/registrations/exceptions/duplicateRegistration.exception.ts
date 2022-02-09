import { ConflictException } from "@nestjs/common";

export class DuplicateRegistrationException extends ConflictException {
  constructor(eventId: string, userId: string) {
    super({
      message: `User ${userId} is allready registered at event ${eventId}`,
    });
  }
}
