import { HttpException, HttpStatus } from "@nestjs/common";
import type { BudgetAction } from "./budget-action";

export class BudgetExceeded extends HttpException {
  constructor(
    readonly action: BudgetAction,
    readonly retryAfterSeconds: number,
  ) {
    super(
      { error: "Rate limit exceeded", action, retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class BudgetUnavailable extends HttpException {
  constructor(readonly action: BudgetAction) {
    super(
      { error: "Rate limiter unavailable", action },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
