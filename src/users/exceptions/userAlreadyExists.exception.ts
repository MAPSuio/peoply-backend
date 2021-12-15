import { HttpException, HttpStatus } from "@nestjs/common";

export class UserAlreadyExistsException extends HttpException {
  constructor(errors: Record<string, string>) {
    super(
      { message: "User could not be created", errors },
      HttpStatus.CONFLICT,
    );
  }
}
