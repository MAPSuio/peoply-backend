import { NotFoundException } from "@nestjs/common";

export class OrganizationDoesNotExistException extends NotFoundException {
  constructor(id: string) {
    super({ message: `No organization with id ${id} exists` });
  }
}
