import { NotFoundException } from "@nestjs/common";

export class UserDoesNotExistException extends NotFoundException {
  constructor(id: string) {
    super({ message: `No user with id ${id} exists` });
  }
}
