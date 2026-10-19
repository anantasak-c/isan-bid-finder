import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const inputPath = resolve(
  process.env.LEGACY_COMPANY_WORK_PATH ?? "../Bit_gov/.bit-gov-mvp/company-work.ndjson",
);
const outputPath = resolve(
  process.env.DISCOVERY_SEED_PATH ?? "data/private/company-contracts.ndjson",
);

const privateIdentityPatterns = [
  /บริษัท\s*ไอคิว\s*โอเอ\s*โซลูชั่น\s*จำกัด/giu,
  /บริษัท\s*ไอคิวโอเอ\s*โซลูชั่น\s*จำกัด/giu,
  /บริษัท\s*ไอคิว\s*เซ้าท์อีสต์\s*โอเอ\s*อุดรธานี\s*จำกัด(?:\s*สำนักงานใหญ่)?/giu,
  /ห้างหุ้นส่วนจำกัด\s*ไอคิว\s*เซ้าท์อีสต์\s*โอเอ\s*อุดรธานี/giu,
  /0415559001356|0415561003255|0413547001087/gu,
];

function redactPrivateIdentity(title: string): string {
  return privateIdentityPatterns
    .reduce((result, pattern) => result.replace(pattern, ""), title)
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function extractTitle(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["title", "projectTitle", "project_name", "ชื่อโครงการ", "รายการพัสดุ"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  for (const key of ["normalized", "project"]) {
    const nested = extractTitle(record[key]);
    if (nested) return nested;
  }
  return null;
}

const raw = await readFile(inputPath, "utf8");
const titles = [...new Set([...new Set(
  raw.split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => extractTitle(JSON.parse(line)))
    .filter((title): title is string => Boolean(title)),
)].map(redactPrivateIdentity).filter(Boolean))];
if (!titles.length) throw new Error(`No project titles found in ${inputPath}`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${titles.map((title) => JSON.stringify({ title })).join("\n")}\n`, "utf8");
console.log(JSON.stringify({ importedTitles: titles.length, outputPath }));
