import { Controller, Get, Query } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { pageBoundsOf } from "./pagination";
import { PaginationDto } from "./pagination.dto";

@Controller("pagination-probe")
class PaginationProbeController {
  @Get()
  find(@Query() page: PaginationDto) {
    return page;
  }
}

type DocumentedParameter = {
  name: string;
  in: string;
  schema?: { maximum?: number; minimum?: number; default?: number };
};

const FAR_ABOVE_ANY_PAGE_BOUND = Number.MAX_SAFE_INTEGER;
const FAR_BELOW_ANY_PAGE_BOUND = Number.MIN_SAFE_INTEGER;

async function documentedQueryParameters(): Promise<DocumentedParameter[]> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PaginationProbeController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    return (document.paths["/pagination-probe"]?.get?.parameters ??
      []) as DocumentedParameter[];
  } finally {
    await app.close();
  }
}

function accepts(field: string, value: number): boolean {
  return (
    validateSync(plainToInstance(PaginationDto, { [field]: String(value) }))
      .length === 0
  );
}

function largestAccepted(field: string): number {
  let accepted = 0;
  let rejected = FAR_ABOVE_ANY_PAGE_BOUND;

  while (rejected - accepted > 1) {
    const candidate = Math.floor((accepted + rejected) / 2);
    if (accepts(field, candidate)) {
      accepted = candidate;
    } else {
      rejected = candidate;
    }
  }

  return accepted;
}

function smallestAccepted(field: string): number {
  let accepted = 0;
  let rejected = FAR_BELOW_ANY_PAGE_BOUND;

  while (accepted - rejected > 1) {
    const candidate = Math.ceil((accepted + rejected) / 2);
    if (accepts(field, candidate)) {
      accepted = candidate;
    } else {
      rejected = candidate;
    }
  }

  return accepted;
}

describe("the documented pagination schema matches what the server enforces", () => {
  let parameters: DocumentedParameter[];

  beforeAll(async () => {
    parameters = await documentedQueryParameters();
  });

  const documented = (name: string): DocumentedParameter => {
    const parameter = parameters.find(
      (candidate) => candidate.name === name && candidate.in === "query",
    );
    if (!parameter) {
      throw new Error(
        `${name} is missing from the generated query parameters: ${parameters
          .map((candidate) => candidate.name)
          .join(", ")}`,
      );
    }
    return parameter;
  };

  it.each(["skip", "take"])(
    "documents the smallest %s the validator accepts",
    (field) => {
      expect(documented(field).schema?.minimum).toBe(smallestAccepted(field));
    },
  );

  it("documents the largest take the validator accepts", () => {
    expect(documented("take").schema?.maximum).toBe(largestAccepted("take"));
  });

  it("documents the default the server applies to an absent take", () => {
    expect(documented("take").schema?.default).toBe(pageBoundsOf({}).take);
  });

  it("leaves skip unbounded above, the way the validator does", () => {
    expect(documented("skip").schema?.maximum).toBeUndefined();
    expect(accepts("skip", FAR_ABOVE_ANY_PAGE_BOUND)).toBe(true);
  });
});
