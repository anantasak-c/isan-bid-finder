import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TaxonomyDraft } from "../src/domain/opportunity";
import { discoverTaxonomyBatch, mergeTaxonomyDrafts } from "../src/lib/gemini";
import { parseDiscoverySeed, publishTaxonomy } from "../src/jobs/discover-taxonomy";

const inputPath = resolve(process.env.DISCOVERY_SEED_PATH ?? "data/private/company-contracts.ndjson");
const outputPath = resolve(process.env.TAXONOMY_OUTPUT_PATH ?? "data/taxonomy.generated.json");

const raw = await readFile(inputPath, "utf8");
const titles = parseDiscoverySeed(raw);
if (!titles.length) throw new Error("Discovery Seed has no contract titles");
const sourceHash = createHash("sha256").update([...titles].sort().join("\n")).digest("hex");
const workDirectory = resolve("data/private/taxonomy-work", sourceHash);
const batchSize = Number(process.env.GEMINI_TAXONOMY_BATCH_SIZE ?? 150);
if (!Number.isInteger(batchSize) || batchSize < 50 || batchSize > 1_000) {
  throw new Error("GEMINI_TAXONOMY_BATCH_SIZE must be an integer from 50 to 1000");
}

await mkdir(workDirectory, { recursive: true });

async function cachedDraft(name: string, build: () => Promise<TaxonomyDraft>) {
  const path = resolve(workDirectory, `${name}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8")) as TaxonomyDraft;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const draft = await build();
  await writeFile(path, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return draft;
}

let drafts: TaxonomyDraft[] = [];
for (let offset = 0; offset < titles.length; offset += batchSize) {
  const batchNumber = Math.floor(offset / batchSize) + 1;
  drafts.push(await cachedDraft(`batch-${batchNumber}`, () =>
    discoverTaxonomyBatch(titles.slice(offset, offset + batchSize)),
  ));
  console.log(JSON.stringify({ stage: "analyze", completed: batchNumber, total: Math.ceil(titles.length / batchSize) }));
}

let level = 1;
while (drafts.length > 1) {
  const merged: TaxonomyDraft[] = [];
  for (let offset = 0; offset < drafts.length; offset += 5) {
    const group = drafts.slice(offset, offset + 5);
    const groupNumber = Math.floor(offset / 5) + 1;
    merged.push(group.length === 1
      ? group[0]
      : await cachedDraft(`merge-${level}-${groupNumber}`, () => mergeTaxonomyDrafts(group)));
    console.log(JSON.stringify({ stage: "merge", level, completed: groupNumber, total: Math.ceil(drafts.length / 5) }));
  }
  drafts = merged;
  level += 1;
}

const taxonomy = drafts[0];
if (/ไอคิว\s*(?:โอเอ|เซ้าท์อีสต์|เซาท์อีสต์)|0415559001356|0415561003255|0413547001087/iu.test(JSON.stringify(taxonomy))) {
  throw new Error("Generated taxonomy contains a private Discovery Seed identity");
}
await publishTaxonomy(titles, taxonomy);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(taxonomy, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ contracts: titles.length, categories: taxonomy.categories.length, outputPath }));
