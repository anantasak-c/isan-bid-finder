import { describe, expect, it } from "vitest";
import { parseRss } from "./egp-rss";
const item = '<item><title>ซื้อระบบประชุม</title><description>69079099908, e-bidding</description><pubDate>2026-08-31</pubDate><link>https://process5.gprocurement.go.th/example?a=1&amp;b=2</link></item>';
describe("RSS evidence gate", () => {
  it("preserves Thai titles and detects truncation", () => {
    const result = parseRss(`<rss><channel><countbyday>21</countbyday>${item}</channel></rss>`, "2026-08-31");
    expect(result.coverage).toBe("truncated");
    expect(result.items[0].title).toBe("ซื้อระบบประชุม");
    expect(result.items[0].sourceUrl).toContain("&b=2");
  });
  it("does not call missing counts or wrong dates complete", () => {
    expect(parseRss(`<rss><channel>${item}</channel></rss>`, "2026-08-31").coverage).toBe("unknown");
    expect(parseRss(`<rss><channel><countbyday>1</countbyday>${item}</channel></rss>`, "2026-09-01").coverage).toBe("date_mismatch");
  });
  it("rejects HTML, external entities, and non-official links", () => {
    expect(() => parseRss('<html>Request Rejected</html>', "2026-08-31")).toThrow();
    expect(() => parseRss('<!DOCTYPE rss><rss/>', "2026-08-31")).toThrow();
    expect(() => parseRss(`<rss><channel>${item.replace('process5.gprocurement.go.th', 'example.com')}</channel></rss>`, "2026-08-31")).toThrow();
  });
});
