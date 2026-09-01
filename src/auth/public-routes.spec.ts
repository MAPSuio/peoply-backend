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

function decoratorBlockAbove(lines: string[], classLine: number): string {
  let boundary = classLine - 1;

  while (boundary >= 0) {
    const line = lines[boundary].trim();
    const isNoise =
      line === "" ||
      line.startsWith("//") ||
      line.startsWith("*") ||
      line.startsWith("/*");

    if (!isNoise && (line.endsWith(";") || line === "}")) {
      break;
    }

    boundary -= 1;
  }

  return lines.slice(boundary + 1, classLine).join("\n");
}

function opensAWholeController(source: string): boolean {
  const lines = source.split("\n");

  return lines.some((line, index) => {
    if (!/^\s*(export\s+)?(abstract\s+)?class\s/.test(line)) {
      return false;
    }

    const block = decoratorBlockAbove(lines, index);

    return block.includes("@Controller(") && block.includes("@Public()");
  });
}

describe("routes anyone may call", () => {
  it("are never opened a whole controller at a time", () => {
    const wholesale = controllerFiles(SOURCE_ROOT).filter((path) =>
      opensAWholeController(readFileSync(path, "utf8")),
    );

    expect(wholesale.map((path) => relative(SOURCE_ROOT, path))).toEqual([]);
  });

  it.each([
    ['@Public()\n@Controller("probe")\nexport class ProbeController {}'],
    ['@Controller("probe")\n@Public()\nexport class ProbeController {}'],
    [
      '@ApiTags("x")\n@Controller("probe")\n@Public()\nclass ProbeController {}',
    ],
    [
      'import { Controller } from "@nestjs/common";\n\n@Public()\n@Controller({\n  path: "probe",\n})\nexport class ProbeController {}',
    ],
    [
      '@Controller({\n  path: "probe",\n  scope: Scope.REQUEST,\n})\n@Public()\nexport class ProbeController {}',
    ],
  ])("is spotted whichever order the decorators are written in", (source) => {
    expect(opensAWholeController(source)).toBe(true);
  });

  it("does not mistake a route-level marker for a wholesale one", () => {
    expect(
      opensAWholeController(
        '@Controller("probe")\nexport class ProbeController {\n  @Public()\n  @Get()\n  list() {}\n}',
      ),
    ).toBe(false);
  });

  it("are exactly the ones listed here, so opening one is a deliberate act", () => {
    const marked = controllerFiles(SOURCE_ROOT).flatMap(publicRoutesIn).sort();

    expect(marked).toEqual([...ROUTES_ANYONE_MAY_CALL].sort());
  });
});
