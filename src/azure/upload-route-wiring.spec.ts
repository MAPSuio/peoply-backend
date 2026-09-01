import { readdirSync } from "node:fs";
import { join } from "node:path";
import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import { getMetadataStorage } from "class-validator";
import type { UploadDto } from "./image-upload";

const SOURCE_ROOT = join(__dirname, "..");

function controllerFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory() && entry.name !== "generated") {
      found.push(...controllerFiles(path));
    } else if (
      entry.name.endsWith(".controller.ts") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      found.push(path);
    }
  }

  return found;
}

type RegisteredLimits = { fields?: number; parts?: number; files?: number };

type UploadRoute = {
  name: string;
  limits: RegisteredLimits;
  dto: UploadDto | undefined;
};

function multerLimitsOf(interceptor: unknown): RegisteredLimits | undefined {
  try {
    const instance = new (interceptor as new () => { multer?: unknown })();
    const multer = instance.multer as { limits?: RegisteredLimits } | undefined;

    return multer?.limits;
  } catch {
    return undefined;
  }
}

function boundDtoOf(prototype: object, method: string): UploadDto | undefined {
  const parameterTypes: UploadDto[] =
    Reflect.getMetadata("design:paramtypes", prototype, method) ?? [];

  return parameterTypes.find(
    (type) =>
      typeof type === "function" &&
      getMetadataStorage().getTargetValidationMetadatas(type, "", true, false)
        .length > 0,
  );
}

function uploadRoutesOf(
  controller: new (...args: never[]) => object,
): UploadRoute[] {
  const prototype = controller.prototype;

  return Object.getOwnPropertyNames(prototype)
    .filter((method) => method !== "constructor")
    .flatMap((method) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      const interceptors: unknown[] =
        Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor?.value) ?? [];

      return interceptors
        .map(multerLimitsOf)
        .filter((limits): limits is RegisteredLimits => limits !== undefined)
        .map((limits) => ({
          name: `${controller.name}.${method}`,
          limits,
          dto: boundDtoOf(prototype, method),
        }));
    });
}

const UPLOAD_ROUTES: UploadRoute[] = controllerFiles(SOURCE_ROOT).flatMap(
  (file) =>
    Object.values(require(file) as Record<string, unknown>)
      .filter(
        (exported): exported is new (...args: never[]) => object =>
          typeof exported === "function" && exported.prototype !== undefined,
      )
      .flatMap(uploadRoutesOf),
);

function acceptedFieldCount(dto: UploadDto): number {
  const names = new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, "", true, false)
      .map((metadata) => metadata.propertyName),
  );

  return names.size;
}

describe("upload routes as the application registers them", () => {
  it("finds every route that accepts a file", () => {
    expect(UPLOAD_ROUTES.map((route) => route.name).sort()).toEqual([
      "EventsController.create",
      "EventsController.update",
      "OrganizationsController.update",
      "UsersController.updateUser",
    ]);
  });

  /* Read off the interceptor the route is really decorated with, not off a
     controller the test builds itself: a route wired to a smaller DTO
     reinstates the 400 that took event editing down, and a test with its own
     controller would stay green through it. */
  it.each(UPLOAD_ROUTES)(
    "lets $name send every field its own bound DTO accepts",
    ({ limits, dto }) => {
      expect(dto).toBeDefined();
      expect(limits.fields).toBeGreaterThanOrEqual(
        acceptedFieldCount(dto as UploadDto),
      );
      expect(limits.parts).toBeGreaterThanOrEqual(
        (limits.fields ?? 0) + (limits.files ?? 0),
      );
    },
  );
});
