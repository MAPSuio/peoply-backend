import { fillDailyNetSeries } from "./organization-analytics.service";

const NOW = new Date("2026-08-20T12:00:00Z");

describe("fillDailyNetSeries", () => {
  it("returns one ascending UTC-day bucket per period day, ending today", () => {
    const series = fillDailyNetSeries([], NOW, 7);

    expect(series).toHaveLength(7);
    expect(series[0].date).toBe("2026-08-14");
    expect(series[6].date).toBe("2026-08-20");
    expect(series.every((day) => day.net === 0)).toBe(true);
  });

  it("places each aggregated day's net on its bucket and zero-fills the rest", () => {
    const series = fillDailyNetSeries(
      [
        { day: "2026-08-20", net: 2 },
        { day: "2026-08-18", net: -1 },
      ],
      NOW,
      7,
    );

    expect(series[6]).toEqual({ date: "2026-08-20", net: 2 });
    expect(series[4]).toEqual({ date: "2026-08-18", net: -1 });
    expect(series[5]).toEqual({ date: "2026-08-19", net: 0 });
  });

  it("ignores aggregated days outside the period window", () => {
    const series = fillDailyNetSeries([{ day: "2026-01-01", net: 9 }], NOW, 7);

    expect(series.some((day) => day.net !== 0)).toBe(false);
  });
});
