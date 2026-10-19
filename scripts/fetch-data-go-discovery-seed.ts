import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CKAN_BASE_URL = "https://data.go.th/api/3/action";
const DATASET_TITLE_PREFIX = "ข้อมูลโครงการจัดซื้อจัดจ้างจากระบบการจัดซื้อจัดจ้างภาครัฐ ปีงบประมาณ";
const outputPath = resolve(
  process.env.DISCOVERY_SEED_PATH ?? "data/private/company-contracts.ndjson",
);

// These values are used only as upstream discovery queries. Output contains project titles only.
const discoveryQueries = [
  "ไอคิวโอเอ โซลูชั่น",
  "ไอคิว เซ้าท์อีสต์ โอเอ อุดรธานี",
  "ไอคิว เซาท์อีสต์ โอเอ อุดรธานี",
];

const privateIdentityPatterns = [
  /บริษัท\s*ไอคิว\s*โอเอ\s*โซลูชั่น\s*จำกัด/giu,
  /บริษัท\s*ไอคิวโอเอ\s*โซลูชั่น\s*จำกัด/giu,
  /บริษัท\s*ไอคิว\s*เซ้าท์อีสต์\s*โอเอ\s*อุดรธานี\s*จำกัด(?:\s*สำนักงานใหญ่)?/giu,
  /ห้างหุ้นส่วนจำกัด\s*ไอคิว\s*เซ้าท์อีสต์\s*โอเอ\s*อุดรธานี/giu,
  /0415559001356|0415561003255|0413547001087/gu,
];

type CkanResource = {
  id?: string;
  datastore_active?: boolean;
};

type CkanDataset = {
  id?: string;
  title?: string;
  resources?: CkanResource[];
};

type CkanResponse<T> = {
  success?: boolean;
  result?: T;
};

const sleep = (milliseconds: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function ckanAction<T>(
  action: string,
  parameters: Record<string, string | number>,
): Promise<T> {
  const apiKey = process.env.DATA_GO_TH_API_KEY;
  if (!apiKey) throw new Error("DATA_GO_TH_API_KEY is not configured");
  const url = new URL(`${CKAN_BASE_URL}/${action}`);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      const payload = await response.json() as CkanResponse<T>;
      if (payload.success && payload.result !== undefined) return payload.result;
      throw new Error(`CKAN ${action} returned success=false`);
    }
    lastError = new Error(`CKAN ${action} returned HTTP ${response.status}`);
    if (response.status !== 429 && response.status < 500) break;
    await sleep(Math.min(8_000, 500 * 2 ** attempt));
  }
  throw lastError ?? new Error(`CKAN ${action} failed`);
}

function redactPrivateIdentity(title: string): string {
  return privateIdentityPatterns
    .reduce((result, pattern) => result.replace(pattern, ""), title)
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function projectTitle(record: Record<string, unknown>): string | null {
  for (const field of ["ชื่อโครงการ", "project_name", "project_title", "รายการพัสดุ"]) {
    if (typeof record[field] === "string" && record[field].trim()) {
      return redactPrivateIdentity(record[field].trim());
    }
  }
  return null;
}

async function fetchMatches(resourceId: string, query: string): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 100) {
    const result = await ckanAction<{ total?: number; records?: Record<string, unknown>[] }>(
      "datastore_search",
      { resource_id: resourceId, q: query, limit: 100, offset },
    );
    const page = result.records ?? [];
    records.push(...page);
    if (page.length < 100 || records.length >= Number(result.total ?? 0)) break;
    await sleep(200);
  }
  return records;
}

const search = await ckanAction<{ results?: CkanDataset[] }>("package_search", {
  q: DATASET_TITLE_PREFIX,
  rows: 100,
});
const datasetStubs = (search.results ?? []).filter((dataset) =>
  dataset.id && dataset.title?.startsWith(DATASET_TITLE_PREFIX),
);
if (!datasetStubs.length) throw new Error("No official procurement datasets were found");

const titles = new Set<string>();
let resourceCount = 0;
for (const stub of datasetStubs) {
  const dataset = await ckanAction<CkanDataset>("package_show", { id: stub.id! });
  const resources = (dataset.resources ?? []).filter(
    (resource): resource is CkanResource & { id: string } =>
      resource.datastore_active === true && typeof resource.id === "string",
  );
  resourceCount += resources.length;
  for (const resource of resources) {
    for (const query of discoveryQueries) {
      const matches = await fetchMatches(resource.id, query);
      for (const match of matches) {
        const title = projectTitle(match);
        if (title) titles.add(title);
      }
      await sleep(150);
    }
  }
}

if (!titles.size) throw new Error("The official API returned no Discovery Seed titles");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${[...titles].sort((left, right) => left.localeCompare(right, "th"))
    .map((title) => JSON.stringify({ title }))
    .join("\n")}\n`,
  "utf8",
);

console.log(JSON.stringify({
  datasets: datasetStubs.length,
  resources: resourceCount,
  importedTitles: titles.size,
  outputPath,
}));
