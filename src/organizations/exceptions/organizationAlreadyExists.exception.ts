import { HttpException, HttpStatus } from "@nestjs/common";

export class OrganizationAlreadyExistsException extends HttpException {
  constructor(errors: Record<string, string>) {
    super(
      { message: "Organization could not be created", errors },
      HttpStatus.CONFLICT,
    );
  }
}
