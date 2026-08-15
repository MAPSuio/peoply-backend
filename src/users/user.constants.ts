// fallow-ignore-file unused-enum-member -- read wholesale by @IsEnum in the registration DTOs, so no member is ever named

/* Nothing names these members, which is why they read as dead. `@IsEnum(...)`
   in the registration DTOs reads the enum at runtime, and the members are the
   allowlist of statuses that role is permitted to send. Removing one does not
   delete dead code; it silently narrows what the API accepts. */
export enum UserAllowedRegStatus {
  GOING = "GOING",
  NOT_GOING = "NOT_GOING",
}

export enum ArrangerAllowedRegStatus {
  BANNED = "BANNED",
  NOT_GOING = "NOT_GOING",
}
