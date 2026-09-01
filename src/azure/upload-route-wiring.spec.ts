import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(__dirname, "..");

function controllerFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory() && entry.name !== "generated") {
      found.push(...controllerFiles(path));
    } else if (entry.name.endsWith(".controller.ts")) {
      found.push(path);
    }
  }

  return found;
}

type UploadRoute = { file: string; interceptorDto: string; bodyDto: string };

function uploadRoutesIn(file: string): UploadRoute[] {
  const source = readFileSync(file, "utf8");
  const routes: UploadRoute[] = [];
  const interceptor =
    /FileInterceptor\(\s*"[^"]+"\s*,\s*imageUploadOptionsFor\((\w+)\)\s*\)/g;

  for (const match of source.matchAll(interceptor)) {
    const afterInterceptor = source.slice(match.index + match[0].length);
    const body = afterInterceptor.match(/@Body\(\)\s+\w+\s*:\s*(\w+)/);

    routes.push({
      file,
      interceptorDto: match[1],
      bodyDto: body?.[1] ?? "no @Body() found",
    });
  }

  return routes;
}

const ALL_CONTROLLERS = controllerFiles(SOURCE_ROOT);
const UPLOAD_ROUTES = ALL_CONTROLLERS.flatMap(uploadRoutesIn);

describe("upload route wiring", () => {
  it("finds every upload route the application exposes", () => {
    expect(UPLOAD_ROUTES).toHaveLength(4);
  });

  /* The limit is only right if it is derived from the DTO that route actually
     binds. Passing a smaller DTO reinstates the 400 this whole module exists
     to stop, and every test that builds its own controller would still pass. */
  it.each(UPLOAD_ROUTES)(
    "derives $interceptorDto from the DTO the handler binds in $file",
    ({ interceptorDto, bodyDto }) => {
      expect(interceptorDto).toBe(bodyDto);
    },
  );

  it("leaves no upload route on a hand-written options object", () => {
    const unwired = ALL_CONTROLLERS.filter((file) => {
      const source = readFileSync(file, "utf8");

      return (
        source.includes("FileInterceptor(") &&
        /FileInterceptor\(\s*"[^"]+"\s*,(?!\s*imageUploadOptionsFor\()/.test(
          source,
        )
      );
    });

    expect(unwired).toEqual([]);
  });
});
