import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = join(__dirname, "..");
const ROUTE = /^\s*@(Get|Post|Patch|Put|Delete|All)\((.*)\)/;

const ROUTES_ANYONE_MAY_CALL = [
  "allergens/allergens.controller.ts: GET ",
  "auth/auth.controller.ts: GET /callback",
  "auth/auth.controller.ts: GET /callback/google",
  "auth/auth.controller.ts: GET /confirm-link",
  "auth/auth.controller.ts: GET /confirm-link/google",
  "auth/auth.controller.ts: GET /dev-login",
  "auth/auth.controller.ts: GET /dev-users",
  "auth/auth.controller.ts: GET /login",
  "auth/auth.controller.ts: GET /login/google",
  "auth/auth.controller.ts: POST /dev-login",
  "auth/auth.controller.ts: POST /dev-logout",
  "auth/auth.controller.ts: POST /refresh",
  "categories/categories.controller.ts: GET ",
  "events/events.controller.ts: GET ",
  "events/events.controller.ts: GET :id",
  "events/events.controller.ts: GET :id/registration-count",
  "events/events.controller.ts: GET :id/updates",
  "health/health.controller.ts: GET _health",
  "health/health.controller.ts: GET readiness",
  "mcp/mcp-tools.controller.ts: GET ",
  "mcp/mcp.controller.ts: ALL ",
  "organizations/organizations.controller.ts: GET ",
  "organizations/organizations.controller.ts: GET /:orgId",
  "organizations/organizations.controller.ts: GET :orgId/calendar.ics",
  "organizations/organizations.controller.ts: GET :orgId/events",
  "popups/popups.controller.ts: GET active",
  "recommendations/recommendations.controller.ts: GET events",
  "recommendations/recommendations.controller.ts: GET organizations",
  "users/users.controller.ts: GET :id",
];

function controllerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return entry === "generated" ? [] : controllerFiles(path);
    }

    return path.endsWith(".controller.ts") ? [path] : [];
  });
}

function publicRoutesIn(path: string): string[] {
  const lines = readFileSync(path, "utf8").split("\n");

  return lines.flatMap((line, index) => {
    const route = ROUTE.exec(line);

    if (!route) {
      return [];
    }

    const decorators: string[] = [];
    for (let above = index - 1; above >= 0; above -= 1) {
      const previous = lines[above].trim();
      if (!previous.startsWith("@") && !previous.startsWith(")")) {
        break;
      }
      decorators.push(previous);
    }

    if (!decorators.some((decorator) => decorator.startsWith("@Public()"))) {
      return [];
    }

    const routePath = route[2].trim().replace(/"/g, "");
    return [
      `${relative(SOURCE_ROOT, path)}: ${route[1].toUpperCase()} ${routePath}`,
    ];
  });
}

describe("routes anyone may call", () => {
  it("are exactly the ones listed here, so opening one is a deliberate act", () => {
    const marked = controllerFiles(SOURCE_ROOT).flatMap(publicRoutesIn).sort();

    expect(marked).toEqual([...ROUTES_ANYONE_MAY_CALL].sort());
  });
});
