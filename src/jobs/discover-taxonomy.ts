import { createHash } from "node:crypto";
import { discoverTaxonomy } from "@/src/lib/gemini";
import { getSupabaseAdmin } from "@/src/lib/supabase";

function titleFrom(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["title", "project_name", "projectTitle", "ชื่อโครงการ", "รายการพัสดุ"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  if (record.normalized && typeof record.normalized === "object") return titleFrom(record.normalized);
  return null;
}

export function parseDiscoverySeed(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const records: unknown[] = trimmed.startsWith("[")
    ? JSON.parse(trimmed) as unknown[]
    : trimmed.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  return [...new Set(records.map(titleFrom).filter((item): item is string => Boolean(item)))];
}

export async function buildAndPublishTaxonomy(raw: string) {
  const titles = parseDiscoverySeed(raw);
  if (!titles.length) throw new Error("Discovery Seed has no contract titles");
  const taxonomy = await discoverTaxonomy(titles);
  await publishTaxonomy(titles, taxonomy);
  return { titles, taxonomy };
}

export async function publishTaxonomy(
  titles: string[],
  taxonomy: Awaited<ReturnType<typeof discoverTaxonomy>>,
) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const sourceHash = createHash("sha256").update([...titles].sort().join("\n")).digest("hex");
    const { error } = await supabase.rpc("publish_taxonomy", {
      taxonomy_payload: taxonomy.categories,
      model_name: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      taxonomy_summary: taxonomy.summary,
      discovery_source_hash: sourceHash,
    });
    if (error) throw error;
  }
}

export async function refreshTaxonomyFromPrivateUrl(): Promise<boolean> {
  const url = process.env.DISCOVERY_SEED_URL;
  if (!url) return false;
  const response = await fetch(url, {
    headers: process.env.DISCOVERY_SEED_BEARER_TOKEN
      ? { authorization: `Bearer ${process.env.DISCOVERY_SEED_BEARER_TOKEN}` }
      : {},
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Private Discovery Seed returned HTTP ${response.status}`);
  await buildAndPublishTaxonomy(await response.text());
  return true;
}
