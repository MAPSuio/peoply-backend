import { NotFoundException } from "@nestjs/common";

export class OrganizationInvitationDoesNotExistException extends NotFoundException {
  constructor(id?: string) {
    super(`No organizations invitation with id: ${id} exists`);
  }
}
