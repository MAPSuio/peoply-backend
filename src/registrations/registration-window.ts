import { BadRequestException } from "@nestjs/common";
import { Event, EventRegistrationMode } from "../generated/prisma/client";

export type RegistrationWindow = Pick<
  Event,
  "endDate" | "regStart" | "regEnd"
> &
  Partial<Pick<Event, "registrationMode">>;

/**
 * Rejects registration writes against an event whose window is closed.
 *
 * A missing event passes through: every caller has its own not-found handling
 * (FK violation, invitation count, explicit lookup) and this guard must not
 * decide that case for them. The mode check is opt-out because declining an
 * invitation is legitimate even when registration happens outside Peoply,
 * and one caller has to order it after its own visibility check.
 */
export function assertRegistrationWindowOpen(
  event: RegistrationWindow | null | undefined,
  { requirePeoplyMode = true } = {},
) {
  if (!event) return;

  /* One instant for all four comparisons rather than a fresh clock reading
     per guard. */
  const now = new Date();

  if (event.endDate && now > event.endDate) {
    throw new BadRequestException("Event has ended");
  }

  if (event.regStart && now < event.regStart) {
    throw new BadRequestException("Registration has not opened yet");
  }

  if (event.regEnd && now > event.regEnd) {
    throw new BadRequestException("Registration has closed");
  }

  if (
    requirePeoplyMode &&
    event.registrationMode !== EventRegistrationMode.PEOPLY
  ) {
    throw new BadRequestException(
      "Registration for this event does not happen in Peoply",
    );
  }
}
