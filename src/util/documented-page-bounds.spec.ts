import { Controller, Get, Query } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { getMetadataStorage, validateSync } from "class-validator";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(__dirname, "..");
const BOUNDED_FIELDS = ["skip", "take"] as const;
const BEYOND_ANY_PAGE_BOUND = Number.MAX_SAFE_INTEGER;
const BELOW_ANY_PAGE_BOUND = Number.MIN_SAFE_INTEGER;

type QueryDto = new (...args: never[]) => object;
type DocumentedParameter = {
  name: string;
  in: string;
  schema?: { maximum?: number; minimum?: number; default?: number };
};

function dtoFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : dtoFilesUnder(path);
    }
    return entry.name.endsWith(".dto.ts") ? [path] : [];
  });
}

function validatedPropertiesOf(dto: QueryDto): Set<string> {
  return new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, "", true, false)
      .map((metadata) => metadata.propertyName),
  );
}

function dtosDeclaringPageBounds(): [string, QueryDto][] {
  const found = new Map<string, QueryDto>();

  for (const file of dtoFilesUnder(SOURCE_ROOT)) {
    for (const exported of Object.values(require(file))) {
      if (typeof exported !== "function") {
        continue;
      }
      const dto = exported as QueryDto;
      const properties = validatedPropertiesOf(dto);
      if (BOUNDED_FIELDS.some((field) => properties.has(field))) {
        found.set(dto.name, dto);
      }
    }
  }

  return [...found.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function probeControllerFor(dto: QueryDto, path: string) {
  class PageBoundsProbeController {
    find(query: unknown) {
      return query;
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    PageBoundsProbeController.prototype,
    "find",
  ) as PropertyDescriptor;

  Reflect.defineMetadata(
    "design:paramtypes",
    [dto],
    PageBoundsProbeController.prototype,
    "find",
  );
  Query()(PageBoundsProbeController.prototype, "find", 0);
  Get()(PageBoundsProbeController.prototype, "find", descriptor);
  Controller(path)(PageBoundsProbeController);

  return PageBoundsProbeController;
}

async function documentedQueryParameters(
  dto: QueryDto,
): Promise<DocumentedParameter[]> {
  const path = `probe-${dto.name}`;
  const moduleRef = await Test.createTestingModule({
    controllers: [probeControllerFor(dto, path)],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    return (document.paths[`/${path}`]?.get?.parameters ??
      []) as DocumentedParameter[];
  } finally {
    await app.close();
  }
}

function accepts(dto: QueryDto, field: string, value: number): boolean {
  return (
    validateSync(plainToInstance(dto, { [field]: String(value) })).length === 0
  );
}

function boundBySearch(
  dto: QueryDto,
  field: string,
  outward: number,
): number | undefined {
  if (accepts(dto, field, outward)) {
    return undefined;
  }

  let accepted = accepts(dto, field, 1) ? 1 : 0;
  let rejected = outward;

  while (Math.abs(rejected - accepted) > 1) {
    const candidate = Math.trunc((accepted + rejected) / 2);
    if (accepts(dto, field, candidate)) {
      accepted = candidate;
    } else {
      rejected = candidate;
    }
  }

  return accepted;
}

describe.each(dtosDeclaringPageBounds())(
  "%s documents the page bounds it enforces",
  (_name, dto) => {
    let parameters: DocumentedParameter[];

    beforeAll(async () => {
      parameters = await documentedQueryParameters(dto);
    });

    const documented = (field: string) =>
      parameters.find(
        (candidate) => candidate.name === field && candidate.in === "query",
      );

    it.each(BOUNDED_FIELDS)("documents the bounds on %s", (field) => {
      if (!validatedPropertiesOf(dto).has(field)) {
        return;
      }

      const parameter = documented(field);
      expect(parameter).toBeDefined();
      expect(parameter?.schema?.maximum).toBe(
        boundBySearch(dto, field, BEYOND_ANY_PAGE_BOUND),
      );
      expect(parameter?.schema?.minimum).toBe(
        boundBySearch(dto, field, BELOW_ANY_PAGE_BOUND),
      );
    });

    it.each(BOUNDED_FIELDS)(
      "documents the %s a caller gets by not asking",
      (field) => {
        if (!validatedPropertiesOf(dto).has(field)) {
          return;
        }

        const resolved = (plainToInstance(dto, {}) as Record<string, unknown>)[
          field
        ];

        expect(documented(field)?.schema?.default).toBe(resolved);
      },
    );
  },
);
