import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServerFactory } from "./mcp-server.factory";
import { MCP_TOOL_SUMMARIES } from "./mcp-tool-summaries";
import { runWithRequest } from "../abuse-budget/principal-context";

const USER_ID = "2d2bfaad-3eb9-4f1b-8657-c0263eeacc5b";
const ARRANGER_ID = "0122cb1d-2572-4fbf-8b09-bf8738d68221";

describe("McpServerFactory", () => {
  const events = { findAll: jest.fn(), findOneVisibleToUser: jest.fn() };
  const eventAccess = { arrangerRoleFor: jest.fn() };
  const organizations = {
    findAll: jest.fn(),
    findByRefOrThrow: jest.fn(),
    findOrgsByUserIdAndRole: jest.fn(),
    findOne: jest.fn(),
    checkUserRole: jest.fn(),
  };
  const registrations = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const arrangerRegistrations = { findAll: jest.fn() };
  const favorites = {
    findAll: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
  };
  const following = {
    findAll: jest.fn(),
    follow: jest.fn(),
    unFollow: jest.fn(),
  };
  const eventArrangers = {
    findAllWithEventsArrangedByUserAndOrganizationsOfUser: jest.fn(),
  };
  const notifications = { findAllPendingByUserId: jest.fn() };
  const abuseBudget = { consume: jest.fn() };
  const factory = new McpServerFactory(
    events as any,
    eventAccess as any,
    organizations as any,
    registrations as any,
    arrangerRegistrations as any,
    favorites as any,
    following as any,
    eventArrangers as any,
    notifications as any,
    abuseBudget as any,
  );

  async function connect(scopes: string[]) {
    const server = factory.create({
      token: "redacted",
      clientId: "key-1",
      scopes,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      extra: {
        user: {
          id: USER_ID,
          arrangerId: ARRANGER_ID,
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
        },
      },
    });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return { client, server };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* Every tool here used to read its whole list and slice the page out in
     memory, so `skip`/`take` bounded the answer but never the query. The
     bounds have to reach the service for that to stop being true. */
  const boundedListTools = [
    ["list_my_organizations", () => organizations.findOrgsByUserIdAndRole],
    [
      "list_my_arranged_events",
      () =>
        eventArrangers.findAllWithEventsArrangedByUserAndOrganizationsOfUser,
    ],
    ["list_my_notifications", () => notifications.findAllPendingByUserId],
    ["list_followed_organizers", () => following.findAll],
  ] as const;

  it.each(boundedListTools)(
    "%s hands the page bounds to the database, not to a slice",
    async (name, source) => {
      source().mockResolvedValue([]);
      const { client, server } = await connect(["peoply:read"]);

      await client.callTool({ name, arguments: { skip: 40, take: 10 } });

      const [actorId, ...rest] = source().mock.calls[0];
      expect(actorId).toBe(USER_ID);
      expect(rest).toContainEqual({ skip: 40, take: 10 });

      await client.close();
      await server.close();
    },
  );

  it("rejects missing authenticated actor data", () => {
    expect(() => factory.create()).toThrow();
  });

  it("only advertises tools granted by the key scopes", async () => {
    const { client, server } = await connect(["peoply:read"]);
    const names = (await client.listTools()).tools.map(({ name }) => name);

    expect(names).toContain("search_events");
    expect(names).not.toContain("register_for_event");
    expect(names).not.toContain("create_event");

    await client.close();
    await server.close();
  });

  it("does not advertise read tools without the read scope", async () => {
    const { client, server } = await connect(["peoply:write"]);
    const names = (await client.listTools()).tools.map(({ name }) => name);

    expect(names).toContain("register_for_event");
    expect(names).not.toContain("search_events");

    await client.close();
    await server.close();
  });

  it("always performs self-service writes as the key owner", async () => {
    registrations.create.mockResolvedValue({ id: "registration-1" });
    const { client, server } = await connect(["peoply:read", "peoply:write"]);
    const eventId = "4e21b35a-6dc4-4784-9650-27980c022a5b";

    await client.callTool({
      name: "register_for_event",
      arguments: { eventId },
    });

    expect(registrations.create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ eventId }),
    );

    await client.close();
    await server.close();
  });

  it("describes exactly the tools it registers, for every scope", async () => {
    const summaries = factory.describeTools();

    for (const scope of ["peoply:read", "peoply:write", "peoply:organize"]) {
      const { client, server } = await connect([scope]);
      const registered = (await client.listTools()).tools
        .map(({ name, description }) => ({ name, description }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const described = summaries
        .filter((summary) => summary.scope === scope)
        .map(({ name, description }) => ({ name, description }))
        .sort((a, b) => a.name.localeCompare(b.name));

      expect(described).toEqual(registered);
      expect(described.length).toBeGreaterThan(0);

      await client.close();
      await server.close();
    }
  });

  it("gives every described tool a title a reader can act on", () => {
    for (const tool of factory.describeTools()) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("gives every tool a Norwegian summary, and keeps no unused ones", () => {
    const described = factory.describeTools();

    for (const tool of described) {
      expect(tool.summary.length).toBeGreaterThan(0);
    }
    expect(Object.keys(MCP_TOOL_SUMMARIES).sort()).toEqual(
      described.map(({ name }) => name).sort(),
    );
  });

  it("keeps the Norwegian summary out of what the agent is told", async () => {
    const { client, server } = await connect(["peoply:read"]);
    const [tool] = (await client.listTools()).tools;

    expect(tool).not.toHaveProperty("summary");

    await client.close();
    await server.close();
  });

  it("refuses attendee data when the actor is not an organizer", async () => {
    eventAccess.arrangerRoleFor.mockResolvedValue(null);
    const { client, server } = await connect(["peoply:organize"]);

    const result = await client.callTool({
      name: "list_event_registrations",
      arguments: { eventId: "4e21b35a-6dc4-4784-9650-27980c022a5b" },
    });

    expect(result.isError).toBe(true);
    expect(arrangerRegistrations.findAll).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });

  it("refuses event creation for an organization the actor does not manage", async () => {
    organizations.findOne.mockResolvedValue({ arrangerId: ARRANGER_ID });
    organizations.checkUserRole.mockResolvedValue(false);
    const { client, server } = await connect(["peoply:organize"]);

    const result = await client.callTool({
      name: "create_event",
      arguments: {
        organizationId: "b622bfcf-d582-4a6e-8407-72beaa796f0d",
        title: "MCP test event",
        description: "Testing authorization",
        startDate: "2026-09-01T10:00:00.000Z",
        locationName: "IFI",
        categoryIds: [1],
        visibility: "PUBLIC",
        hasFood: false,
      },
    });

    expect(result.isError).toBe(true);

    await client.close();
    await server.close();
  });
});

describe("McpServerFactory tool budget", () => {
  it("charges every tool call in a batch, not once per request", async () => {
    const organizations = { findAll: jest.fn().mockResolvedValue([]) };
    const abuseBudget = { consume: jest.fn() };
    const factory = new McpServerFactory(
      {} as any,
      {} as any,
      organizations as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      abuseBudget as any,
    );

    const server = factory.create({
      token: "redacted",
      clientId: "key-1",
      scopes: ["peoply:read"],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      extra: {
        keyId: "key-1",
        user: {
          id: "2d2bfaad-3eb9-4f1b-8657-c0263eeacc5b",
          arrangerId: "0122cb1d-2572-4fbf-8b09-bf8738d68221",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
        },
      },
    });

    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const toolCallsInOneBatch = 25;

    await runWithRequest(
      {
        headers: {},
        auth: {
          extra: {
            keyId: "key-1",
            user: { id: "2d2bfaad-3eb9-4f1b-8657-c0263eeacc5b" },
          },
        },
      },
      async () => {
        for (let i = 0; i < toolCallsInOneBatch; i += 1) {
          await client.callTool({
            name: "search_organizations",
            arguments: { skip: 0, take: 1 },
          });
        }
      },
    );

    expect(abuseBudget.consume).toHaveBeenCalledTimes(toolCallsInOneBatch);
    expect(abuseBudget.consume).toHaveBeenLastCalledWith(
      {
        user: { kind: "user", id: "2d2bfaad-3eb9-4f1b-8657-c0263eeacc5b" },
        mcpKey: { kind: "mcpKey", id: "key-1" },
        ip: { kind: "ip", id: "unknown" },
      },
      "mcp.tool",
    );
  });
});
