import { NotFoundException } from "@nestjs/common";

export class EventInvitationDoesNotExistException extends NotFoundException {
  constructor(id?: string) {
    super(`No Events invitation with id: ${id} exists`);
  }
}
