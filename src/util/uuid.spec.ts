import { createUuid, createUuidV5, isUUID } from "./uuid";

describe("uuid utils", () => {
  it("creates RFC 4122 UUIDs", () => {
    expect(isUUID(createUuid())).toBe(true);
  });

  it("creates deterministic UUID v5 values", () => {
    expect(createUuidV5("hello", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "9342d47a-1bab-5709-9869-c840b2eac501",
    );
  });

  it("rejects invalid UUID namespaces", () => {
    expect(() => createUuidV5("hello", "invalid")).toThrow(
      "Invalid UUID namespace",
    );
  });
});
