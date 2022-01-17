import { ConflictException } from "@nestjs/common";

export class OrganizationAlreadyExistsException extends ConflictException {
  constructor(errors: Record<string, string>) {
    super({ message: "Organization could not be created", errors });
  }
}
