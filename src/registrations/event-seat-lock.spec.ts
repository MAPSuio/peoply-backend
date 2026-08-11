import { Prisma } from "../generated/prisma/client";
import { lockEventForSeatChange } from "./event-seat-lock";

describe("lockEventForSeatChange", () => {
  const trxWithSpy = () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    return {
      trx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient,
      queryRaw,
    };
  };

  /* The whole point is the lock, so assert the statement really says FOR
     UPDATE — a plain SELECT would look identical at every other level and
     silently do nothing. */
  it("takes a FOR UPDATE lock on the event row", async () => {
    const { trx, queryRaw } = trxWithSpy();

    await lockEventForSeatChange(trx, "event-1");

    const [strings] = queryRaw.mock.calls[0];
    expect(strings.join("?").replace(/\s+/g, " ")).toBe(
      "SELECT id FROM events WHERE id = ? FOR UPDATE",
    );
  });

  /* Tagged template, so the id is bound as a parameter. If this ever became a
     plain string the value would be interpolated straight into SQL. */
  it("binds the event id as a parameter rather than interpolating it", async () => {
    const { trx, queryRaw } = trxWithSpy();

    await lockEventForSeatChange(trx, "'; DROP TABLE events; --");

    const [strings, ...values] = queryRaw.mock.calls[0];
    expect(Array.isArray(strings)).toBe(true);
    expect(values).toEqual(["'; DROP TABLE events; --"]);
    expect(strings.join("")).not.toContain("DROP TABLE");
  });

  it("waits for the lock before returning", async () => {
    const order: string[] = [];
    const trx = {
      $queryRaw: jest.fn(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        order.push("locked");
        return [];
      }),
    } as unknown as Prisma.TransactionClient;

    await lockEventForSeatChange(trx, "event-1");
    order.push("continued");

    expect(order).toEqual(["locked", "continued"]);
  });
});
