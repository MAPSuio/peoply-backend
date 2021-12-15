import { NotFoundException } from "@nestjs/common";

export class RegistrationsNotFoundException extends NotFoundException {
  constructor(event_id: number, user_id: string) {
    super(
      `No event with combination of event_id ${event_id} and user_id ${user_id}  exists`,
    );
  }
}
