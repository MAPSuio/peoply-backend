import { Test } from "@nestjs/testing";
import { AbuseBudgetService } from "./abuse-budget.service";
import { BudgetExceeded, BudgetUnavailable } from "./budget-errors";
import { InMemoryBudgetStore } from "./in-memory-budget-store";
import {
  BUDGET_CLOCK,
  BUDGET_STORE,
  type BudgetStore,
  type Clock,
} from "./budget-tokens";
import {
  ipPrincipal,
  mcpKeyPrincipal,
  userPrincipal,
  type RequestIdentities,
} from "./principal";

const MCP_TOOL_LIMIT = 120;
const EVENT_CREATE_LIMIT = 20;

class FixedClock implements Clock {
  constructor(public value: number) {}
  now() {
    return this.value;
  }
}

class ThrowingStore implements BudgetStore {
  async increment(): Promise<never> {
    throw new Error("store down");
  }
}

function asUser(userId: string): RequestIdentities {
  return { user: userPrincipal(userId), ip: ipPrincipal("203.0.113.1") };
}

function asUserOverMcp(userId: string, keyId: string): RequestIdentities {
  return {
    user: userPrincipal(userId),
    mcpKey: mcpKeyPrincipal(keyId),
    ip: ipPrincipal("203.0.113.1"),
  };
}

function asAnonymous(address: string): RequestIdentities {
  return { ip: ipPrincipal(address) };
}

async function serviceWith(store: BudgetStore, clock: Clock) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AbuseBudgetService,
      { provide: BUDGET_STORE, useValue: store },
      { provide: BUDGET_CLOCK, useValue: clock },
    ],
  }).compile();

  return moduleRef.get(AbuseBudgetService);
}

describe("AbuseBudgetService", () => {
  it("allows calls up to the action limit and rejects the one past it", async () => {
    const clock = new FixedClock(1_000);
    const service = await serviceWith(new InMemoryBudgetStore(), clock);
    const identities = asUser("u1");

    for (let i = 0; i < 3; i += 1) {
      await expect(
        service.consume(identities, "organization.create"),
      ).resolves.toBeUndefined();
    }

    await expect(
      service.consume(identities, "organization.create"),
    ).rejects.toBeInstanceOf(BudgetExceeded);
  });

  it("charges a batch by its cost, so one oversized call is refused", async () => {
    const clock = new FixedClock(1_000);
    const service = await serviceWith(new InMemoryBudgetStore(), clock);

    await expect(
      service.consume(asUser("u1"), "invitation.recipient", 501),
    ).rejects.toBeInstanceOf(BudgetExceeded);
  });

  it("refills the bucket once the window elapses", async () => {
    const clock = new FixedClock(1_000);
    const service = await serviceWith(new InMemoryBudgetStore(), clock);
    const identities = asUser("u1");

    for (let i = 0; i < 3; i += 1) {
      await service.consume(identities, "organization.create");
    }

    clock.value = 1_000 + 24 * 60 * 60 * 1000 + 1;

    await expect(
      service.consume(identities, "organization.create"),
    ).resolves.toBeUndefined();
  });

  it("keeps separate buckets per principal and per action", async () => {
    const clock = new FixedClock(1_000);
    const store = new InMemoryBudgetStore();
    const service = await serviceWith(store, clock);

    for (let i = 0; i < 3; i += 1) {
      await service.consume(asUser("u1"), "organization.create");
    }

    await expect(
      service.consume(asUser("u2"), "organization.create"),
    ).resolves.toBeUndefined();
    await expect(
      service.consume(asUser("u1"), "event.create"),
    ).resolves.toBeUndefined();
  });

  it("reports a retry-after that shrinks as the window drains", async () => {
    const clock = new FixedClock(0);
    const service = await serviceWith(new InMemoryBudgetStore(), clock);
    const identities = asUser("u1");

    for (let i = 0; i < 3; i += 1) {
      await service.consume(identities, "organization.create");
    }

    clock.value = 23 * 60 * 60 * 1000;

    await service
      .consume(identities, "organization.create")
      .then(() => {
        throw new Error("expected BudgetExceeded");
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(BudgetExceeded);
        expect((error as BudgetExceeded).retryAfterSeconds).toBe(60 * 60);
      });
  });

  it("fails closed when the store is down for a mutation action", async () => {
    const service = await serviceWith(new ThrowingStore(), new FixedClock(0));

    await expect(
      service.consume(asUser("u1"), "event.create"),
    ).rejects.toBeInstanceOf(BudgetUnavailable);
  });

  it("fails open when the store is down for a read action", async () => {
    const service = await serviceWith(new ThrowingStore(), new FixedClock(0));

    await expect(
      service.consume(asUser("u1"), "registration.create"),
    ).resolves.toBeUndefined();
  });
});

describe("AbuseBudgetService identity selection", () => {
  it("charges the user bucket for a creation made over MCP, whichever key is used", async () => {
    const service = await serviceWith(
      new InMemoryBudgetStore(),
      new FixedClock(0),
    );

    for (let i = 0; i < EVENT_CREATE_LIMIT; i += 1) {
      await service.consume(asUserOverMcp("u1", "key-1"), "event.create");
    }

    await expect(
      service.consume(asUserOverMcp("u1", "key-2"), "event.create"),
    ).rejects.toBeInstanceOf(BudgetExceeded);
  });

  it("charges the key bucket for mcp.tool, so one user's keys are metered apart", async () => {
    const service = await serviceWith(
      new InMemoryBudgetStore(),
      new FixedClock(0),
    );

    for (let i = 0; i < MCP_TOOL_LIMIT; i += 1) {
      await service.consume(asUserOverMcp("u1", "key-1"), "mcp.tool");
    }

    await expect(
      service.consume(asUserOverMcp("u1", "key-1"), "mcp.tool"),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    await expect(
      service.consume(asUserOverMcp("u1", "key-2"), "mcp.tool"),
    ).resolves.toBeUndefined();
  });

  it("falls back to the most specific identity present when the configured one is absent", async () => {
    const service = await serviceWith(
      new InMemoryBudgetStore(),
      new FixedClock(0),
    );

    for (let i = 0; i < MCP_TOOL_LIMIT; i += 1) {
      await service.consume(asUser("u1"), "mcp.tool");
    }

    await expect(
      service.consume(asUser("u1"), "mcp.tool"),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    await expect(
      service.consume(asUser("u2"), "mcp.tool"),
    ).resolves.toBeUndefined();
  });

  it("falls back to the address when nobody is authenticated", async () => {
    const service = await serviceWith(
      new InMemoryBudgetStore(),
      new FixedClock(0),
    );

    for (let i = 0; i < EVENT_CREATE_LIMIT; i += 1) {
      await service.consume(asAnonymous("198.51.100.7"), "event.create");
    }

    await expect(
      service.consume(asAnonymous("198.51.100.7"), "event.create"),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    await expect(
      service.consume(asAnonymous("198.51.100.8"), "event.create"),
    ).resolves.toBeUndefined();
  });
});
