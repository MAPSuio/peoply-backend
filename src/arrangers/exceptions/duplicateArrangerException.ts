import { ConflictException } from "@nestjs/common";

export class DuplicateArrangerException extends ConflictException {
  constructor(arrangerId: string) {
    super(`Arranger with id: ${arrangerId} already exists`);
  }
}
