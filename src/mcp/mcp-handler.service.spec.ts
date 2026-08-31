import { UnauthorizedException } from "@nestjs/common";
import { McpHandlerService } from "./mcp-handler.service";

function responseMock() {
  const response: any = {
    end: jest.fn(),
    json: jest.fn(),
    on: jest.fn(),
    setHeader: jest.fn(),
    writeHead: jest.fn(),
  };
  response.status = jest.fn(() => response);
  return response;
}

describe("McpHandlerService", () => {
  const apiKeys = { verify: jest.fn() };
  const rateLimits = { consume: jest.fn() };
  const servers = { create: jest.fn() };
  const service = new McpHandlerService(
    apiKeys as any,
    rateLimits as any,
    servers as any,
  );

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects an untrusted Host header before authenticating", async () => {
    const response = responseMock();

    await service.handle(
      { headers: { host: "attacker.example" } } as any,
      response,
    );

    expect(response.writeHead).toHaveBeenCalledWith(
      403,
      expect.objectContaining({ "Content-Type": "application/json" }),
    );
    expect(apiKeys.verify).not.toHaveBeenCalled();
  });

  it("rejects an untrusted browser Origin before authenticating", async () => {
    const response = responseMock();

    await service.handle(
      {
        headers: {
          host: "api.peoply.app",
          origin: "https://attacker.example",
        },
      } as any,
      response,
    );

    expect(response.writeHead).toHaveBeenCalledWith(
      403,
      expect.objectContaining({ "Content-Type": "application/json" }),
    );
    expect(apiKeys.verify).not.toHaveBeenCalled();
  });

  it("rejects a JSON-RPC batch array before authenticating or dispatching", async () => {
    const response = responseMock();

    await service.handle(
      {
        headers: { host: "api.peoply.app" },
        body: [
          { jsonrpc: "2.0", id: 1, method: "tools/call" },
          { jsonrpc: "2.0", id: 2, method: "tools/call" },
        ],
      } as any,
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(apiKeys.verify).not.toHaveBeenCalled();
    expect(rateLimits.consume).not.toHaveBeenCalled();
  });

  it("returns a bearer challenge when the token is missing", async () => {
    const response = responseMock();

    await service.handle(
      { headers: { host: "api.peoply.app" } } as any,
      response,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      "Bearer",
    );
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("returns a bearer challenge when the token is invalid", async () => {
    const response = responseMock();
    apiKeys.verify.mockRejectedValue(new UnauthorizedException());

    await service.handle(
      {
        headers: {
          authorization: "Bearer invalid",
          host: "api.peoply.app",
        },
      } as any,
      response,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      "Bearer",
    );
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rate limits by verified API key", async () => {
    const response = responseMock();
    apiKeys.verify.mockResolvedValue({ keyId: "key-1" });
    rateLimits.consume.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 12,
    });

    await service.handle(
      {
        headers: {
          authorization: "Bearer ppl_mcp_token",
          host: "api.peoply.app",
        },
      } as any,
      response,
    );

    expect(rateLimits.consume).toHaveBeenCalledWith("key-1");
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "12");
    expect(response.status).toHaveBeenCalledWith(429);
  });

  it("populates req.auth with verified key scopes and passes request to node handler", async () => {
    const response = responseMock();
    const expiresAt = new Date(Date.now() + 60_000);
    const verifiedUser = {
      id: "user-1",
      arrangerId: "arr-1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    };
    apiKeys.verify.mockResolvedValue({
      keyId: "key-1",
      user: verifiedUser,
      scopes: ["peoply:read", "peoply:write"],
      expiresAt,
    });
    rateLimits.consume.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });

    const req: any = {
      headers: {
        authorization: "Bearer ppl_mcp_test_token",
        host: "api.peoply.app",
      },
      body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
    };

    await service.handle(req, response);

    expect(req.auth).toEqual({
      token: "ppl_mcp_test_token",
      clientId: "key-1",
      scopes: ["peoply:read", "peoply:write"],
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      extra: { user: verifiedUser, keyId: "key-1" },
    });
  });
});
