import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { AllergensController } from "../allergens/allergens.controller";
import { AllergensService } from "../allergens/allergens.service";
import { BROWSER_CACHE_TTL } from "./browser-cache";

/**
 * The unit spec reads decorator metadata, which cannot show that the Express
 * adapter actually writes the header. This boots a Nest application around
 * the real controller and asserts over the wire.
 */
describe("browser cache header on the wire", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AllergensController],
      providers: [
        {
          provide: AllergensService,
          useValue: { findAll: async () => [{ id: 1, name: "gluten" }] },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sends private max-age on the allergen list", async () => {
    const response = await request(app.getHttpServer())
      .get("/allergens")
      .expect(200);

    expect(response.headers["cache-control"]).toBe(
      `private, max-age=${BROWSER_CACHE_TTL.referenceTables}`,
    );
  });
});
