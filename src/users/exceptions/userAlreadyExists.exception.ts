import { ConflictException } from "@nestjs/common";

export class UserAlreadyExistsException extends ConflictException {
  constructor(errors: Record<string, string>) {
    super({ message: "User could not be created", errors });
  }
}
