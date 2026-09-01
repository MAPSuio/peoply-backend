import { Controller, Get, Query } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { MAX_PAGE_SIZE, pageBoundsOf } from "./pagination";
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

function acceptsTake(take: number): boolean {
  return (
    validateSync(plainToInstance(PaginationDto, { take: String(take) }))
      .length === 0
  );
}

function largestAcceptedTake(): number {
  let accepted = 0;
  let rejected = MAX_PAGE_SIZE * 1000;

  while (rejected - accepted > 1) {
    const candidate = Math.floor((accepted + rejected) / 2);
    if (acceptsTake(candidate)) {
      accepted = candidate;
    } else {
      rejected = candidate;
    }
  }

  return accepted;
}

describe("the documented pagination schema matches what the server does", () => {
  let parameters: DocumentedParameter[];

  beforeAll(async () => {
    parameters = await documentedQueryParameters();
  });

  const takeParameter = () => {
    const parameter = parameters.find(
      (candidate) => candidate.name === "take" && candidate.in === "query",
    );
    if (!parameter) {
      throw new Error(
        `take is missing from the generated query parameters: ${parameters
          .map((candidate) => candidate.name)
          .join(", ")}`,
      );
    }
    return parameter;
  };

  it("documents a maximum for take", () => {
    expect(takeParameter().schema?.maximum).toBeDefined();
  });

  it("documents the maximum the validator actually enforces", () => {
    expect(takeParameter().schema?.maximum).toBe(largestAcceptedTake());
  });

  it("documents the default the server actually applies to an absent take", () => {
    expect(takeParameter().schema?.default).toBe(pageBoundsOf({}).take);
  });

  it("documents skip as an offset the first page can use", () => {
    const skip = parameters.find(
      (candidate) => candidate.name === "skip" && candidate.in === "query",
    );

    expect(skip).toBeDefined();
    expect(skip?.schema?.minimum ?? 0).toBe(0);
  });
});
