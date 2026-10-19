import { describe, expect, it } from "vitest";
import { demoOpportunities } from "@/src/lib/demo-data";
import { filterAndRankOpportunities, isOpenOpportunity, parseSearchFilters } from "@/src/domain/search";

describe("open opportunity boundary", () => {
  it("accepts only a supported method with a future deadline", () => {
    const now = new Date("2026-09-07T00:00:00.000Z");
    expect(isOpenOpportunity({ method: "e-bidding", closesAt: "2026-09-08T00:00:00.000Z" }, now)).toBe(true);
    expect(isOpenOpportunity({ method: "e-bidding", closesAt: "2026-09-06T00:00:00.000Z" }, now)).toBe(false);
  });

  it("parses only Isan provinces and clamps result limits", () => {
    expect(parseSearchFilters({
      province: ["อุดรธานี", "เชียงใหม่"],
      minBudget: "1,000,000",
      limit: "500",
    })).toMatchObject({ provinces: ["อุดรธานี"], minBudget: 1_000_000, limit: 100 });
  });

  it("returns the matching category", () => {
    const filters = parseSearchFilters({ q: "กล้อง", sort: "relevance" });
    const results = filterAndRankOpportunities(demoOpportunities(), filters, new Date());
    expect(results[0]?.categorySlug).toBe("security-system");
  });
});
