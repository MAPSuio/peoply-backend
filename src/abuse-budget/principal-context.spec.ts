import {
  currentIdentities,
  runWithRequest,
  type PrincipalRequest,
} from "./principal-context";
import { principalKey, selectPrincipal } from "./principal";

const MCP_REQUEST: PrincipalRequest = {
  headers: {},
  ip: "203.0.113.9",
  auth: { extra: { keyId: "key-1", user: { id: "user-1" } } },
};

describe("request identities", () => {
  it("resolves nothing outside a request scope", () => {
    expect(currentIdentities()).toBeNull();
  });

  it("falls back to the address when nobody is authenticated", () => {
    runWithRequest({ headers: {}, ip: "203.0.113.5" }, () => {
      const identities = currentIdentities();

      expect(identities?.user).toBeUndefined();
      expect(identities?.mcpKey).toBeUndefined();
      expect(identities?.ip).toEqual({ kind: "ip", id: "203.0.113.5" });
    });
  });

  it("reads the session user established after the scope opened", () => {
    const request: PrincipalRequest = { headers: {}, ip: "203.0.113.5" };

    runWithRequest(request, () => {
      expect(currentIdentities()?.user).toBeUndefined();

      request.user = { id: "user-9" };

      expect(currentIdentities()?.user).toEqual({
        kind: "user",
        id: "user-9",
      });
    });
  });

  it("keeps both the key and its user on an MCP request", () => {
    runWithRequest(MCP_REQUEST, () => {
      const identities = currentIdentities();

      expect(identities?.mcpKey).toEqual({ kind: "mcpKey", id: "key-1" });
      expect(identities?.user).toEqual({ kind: "user", id: "user-1" });
    });
  });

  it("charges a user-keyed action to the user even over MCP", () => {
    runWithRequest(MCP_REQUEST, () => {
      const identities = currentIdentities();

      expect(selectPrincipal(identities as never, "user")).toEqual({
        kind: "user",
        id: "user-1",
      });
      expect(selectPrincipal(identities as never, "mcpKey")).toEqual({
        kind: "mcpKey",
        id: "key-1",
      });
    });
  });

  it("does not leak one request's identity into another running beside it", async () => {
    const seen: (string | undefined)[] = [];

    const first = runWithRequest(
      { headers: {}, ip: "1.1.1.1", user: { id: "user-a" } },
      async () => {
        await new Promise((resolve) => setImmediate(resolve));
        seen.push(currentIdentities()?.user?.id);
      },
    );

    const second = runWithRequest(
      { headers: {}, ip: "2.2.2.2", user: { id: "user-b" } },
      async () => {
        seen.push(currentIdentities()?.user?.id);
      },
    );

    await Promise.all([first, second]);

    expect(seen.sort()).toEqual(["user-a", "user-b"]);
  });

  it("cannot collide buckets across identity kinds sharing an id", () => {
    expect(principalKey({ kind: "user", id: "1" })).not.toBe(
      principalKey({ kind: "ip", id: "1" }),
    );
    expect(principalKey({ kind: "mcpKey", id: "1" })).not.toBe(
      principalKey({ kind: "user", id: "1" }),
    );
  });
});
