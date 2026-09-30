import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Reflector } from "@nestjs/core";

import { RequireOrgRole } from "./require-org-role";
import { RequireEventRole } from "./require-event-role";
import { OrganizationRolesGuard } from "./guards/organizationRoles.guard";
import { EventRolesGuard } from "./guards/eventRoles.guard";
import { OrganizationRole } from "../generated/prisma/client";

const SOURCE_ROOT = join(__dirname, "..");
const OWNING_MODULES = [
  join("auth", "require-org-role.ts"),
  join("auth", "require-event-role.ts"),
];
const HAND_ROLLED_PAIR =
  /@OrganizationRoles\([^@]*?\)[\s\S]{0,400}?@UseGuards\((?:OrganizationRolesGuard|EventRolesGuard)\)/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesUnder(path);

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

class OrgRoute {
  @RequireOrgRole(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  handler() {}
}

class EventRoute {
  @RequireEventRole(OrganizationRole.OWNER)
  handler() {}
}

describe("the role decorators bring their guard with them", () => {
  const reflector = new Reflector();

  it("RequireOrgRole carries the roles the route named", () => {
    expect(reflector.get("roles", OrgRoute.prototype.handler)).toEqual([
      OrganizationRole.ADMIN,
      OrganizationRole.OWNER,
    ]);
  });

  it("RequireOrgRole applies the organization guard", () => {
    expect(reflector.get("__guards__", OrgRoute.prototype.handler)).toContain(
      OrganizationRolesGuard,
    );
  });

  it("RequireEventRole carries the roles the route named", () => {
    expect(reflector.get("roles", EventRoute.prototype.handler)).toEqual([
      OrganizationRole.OWNER,
    ]);
  });

  it("RequireEventRole applies the event guard", () => {
    expect(reflector.get("__guards__", EventRoute.prototype.handler)).toContain(
      EventRolesGuard,
    );
  });

  it("is how every route pairs roles with a guard, so route 27 cannot list roles nothing enforces", () => {
    const offenders = sourceFilesUnder(SOURCE_ROOT).filter((path) => {
      if (
        OWNING_MODULES.some((module) => path.endsWith(module)) ||
        path.endsWith(".spec.ts")
      ) {
        return false;
      }

      return HAND_ROLLED_PAIR.test(readFileSync(path, "utf8"));
    });

    expect(offenders).toEqual([]);
  });
});
