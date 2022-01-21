import { NotFoundException } from "@nestjs/common";

export class RegistrationNotFoundException extends NotFoundException {
  constructor(event_id: string, user_id: string) {
    super(
      `No event with combination of event_id ${event_id} and user_id ${user_id}  exists`,
    );
  }
}
