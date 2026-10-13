import {
  AZURE_BASE_URL,
  contentTypeFor,
  keyFromAzureUrl,
  parseMigrationMode,
} from "./azure-migration";

describe("azure migration helpers", () => {
  it("keeps the container and file name as the Spaces key", () => {
    expect(keyFromAzureUrl(`${AZURE_BASE_URL}event-images/a%20b.jpg`)).toBe(
      "event-images/a b.jpg",
    );
  });

  it("rejects urls outside the Azure account", () => {
    expect(() =>
      keyFromAzureUrl("https://lh3.googleusercontent.com/x"),
    ).toThrow();
  });

  it("derives the content type from the extension", () => {
    expect(contentTypeFor("profile-images/x.JPG")).toBe("image/jpeg");
    expect(contentTypeFor("event-images/x.webp")).toBe("image/webp");
    expect(contentTypeFor("event-images/x")).toBe("application/octet-stream");
  });

  it("accepts only the known modes and defaults to dry", () => {
    expect(parseMigrationMode(["node", "script"])).toBe("dry");
    expect(parseMigrationMode(["node", "script", "copy"])).toBe("copy");
    expect(() => parseMigrationMode(["node", "script", "delete"])).toThrow();
  });
});
