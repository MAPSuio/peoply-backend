import { NotFoundException } from "@nestjs/common";

export class RolesNotFoundException extends NotFoundException {
  constructor() {
    super(
      `No roles is found. Should be specified with OrganizationRoles decorator`,
    );
  }
}
