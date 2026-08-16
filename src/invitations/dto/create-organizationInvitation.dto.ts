import { ChangeRoleDto } from "../../organizations/dto/change-role.dto";

/** An invitation carries the same pair as a role change: user and role. */
export class CreateOrganizationInvitationDto extends ChangeRoleDto {}
