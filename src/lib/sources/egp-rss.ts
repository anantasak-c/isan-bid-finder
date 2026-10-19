import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";

// Verified agency link: https://rss-procurement.udonpao.go.th/feed-gprocurement-process/
// Coverage is explicitly limited until more agency IDs are verified.
export const rssAgencies = [{ id: "2410101", name: "องค์การบริหารส่วนจังหวัดอุดรธานี", province: "อุดรธานี" }];
export const eventTypes = ["D0", "D1", "D2", "W0", "W1", "W2"] as const;
export type RssItem = { projectId: string; title: string; publishedDate: string; sourceUrl: string; description: string; fingerprint: string };

export function parseRss(xml: string, date: string) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Invalid RSS XML");
  const channel = new XMLParser({ parseTagValue: false, trimValues: true }).parse(xml)?.rss?.channel;
  if (!channel || typeof channel !== "object") throw new Error("Expected RSS channel");
  const raw = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  const items: RssItem[] = raw.map((item: Record<string, unknown>) => {
    const description = String(item.description ?? "");
    const projectId = description.split(",")[0].trim();
    const sourceUrl = String(item.link ?? "");
    const url = new URL(sourceUrl);
    if (!/^[0-9]{11}$/u.test(projectId) || !String(item.title ?? "").trim()) throw new Error("Invalid RSS project");
    if (!["http:", "https:"].includes(url.protocol) || !["process.gprocurement.go.th", "process3.gprocurement.go.th", "process5.gprocurement.go.th"].includes(url.hostname) || url.username || url.password) throw new Error("Unexpected RSS link");
    return { projectId, title: String(item.title), publishedDate: String(item.pubDate ?? ""), sourceUrl, description, fingerprint: createHash("sha256").update(JSON.stringify(item)).digest("hex") };
  });
  const count = /^\d+$/u.test(String(channel.countbyday ?? "")) ? Number(channel.countbyday) : null;
  const coverage = items.some(i => i.publishedDate !== date) ? "date_mismatch" : count === null ? "unknown" : count > items.length ? "truncated" : count === items.length ? "complete_for_query" : "count_mismatch";
  return { items, expected: count, coverage };
}

export async function fetchRss(agencyId: string, date: string, method: "15" | "16", type: typeof eventTypes[number]) {
  if (!/^\d{4,10}$/u.test(agencyId) || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid RSS query");
  const url = new URL("https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml");
  url.search = new URLSearchParams({ deptId: agencyId, announceDate: date.replaceAll("-", ""), methodId: method, anounceType: type }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2_000_000) throw new Error("RSS response exceeds limit");
  return { sourceUrl: url.href, ...parseRss(new TextDecoder("windows-874").decode(bytes), date) };
}
