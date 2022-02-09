import { NotFoundException } from "@nestjs/common";

export class RegistrationNotFoundException extends NotFoundException {
  constructor(eventId: string, userId: string) {
    super(
      `No event with combination of eventId ${eventId} and userId ${userId}  exists`,
    );
  }
}
