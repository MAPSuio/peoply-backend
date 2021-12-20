import { NotFoundException } from "@nestjs/common";

export class UserDoesNotExistException extends NotFoundException {
  constructor(id?: string) {
    if (id) {
      super({ message: `No user with id ${id} exists` });
    } else {
      super({ message: `No user with these credentials exists` });
    }
  }
}
