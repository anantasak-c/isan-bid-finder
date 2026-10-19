import { createHash } from "node:crypto";
import { ISAN_PROVINCES, procurementMethodSchema } from "@/src/domain/opportunity";

export type SourceCandidate = {
  sourceKind: "data-go-th-ckan";
  sourceId: string;
  title: string;
  description: string | null;
  agencyName: string;
  province: (typeof ISAN_PROVINCES)[number];
  method: "e-bidding" | "e-market";
  budgetBaht: number | null;
  announcedAt: string;
  closesAt: string;
  sourceUpdatedAt: string | null;
  sourceUrl: string;
  rawFingerprint: string;
};

export type MappingResult =
  | { ok: true; candidate: SourceCandidate }
  | { ok: false; issueCode: string; details: Record<string, unknown> };

const aliases = {
  id: ["project_id", "project_code", "รหัสโครงการ", "เลขที่โครงการ", "_id"],
  title: ["project_name", "project_title", "ชื่อโครงการ", "รายการพัสดุ"],
  description: ["description", "รายละเอียด", "ขอบเขตงาน"],
  agency: ["dept_name", "agency_name", "ชื่อหน่วยงาน", "หน่วยงาน"],
  province: ["province", "province_name", "จังหวัด"],
  method: ["method", "procurement_method", "วิธีการจัดซื้อจัดจ้าง", "วิธีจัดซื้อจัดจ้าง"],
  budget: ["project_money", "budget", "budget_baht", "วงเงินงบประมาณ", "วงเงินที่จัดซื้อจัดจ้าง"],
  announcedAt: ["announce_date", "announcement_date", "วันที่ประกาศ"],
  closesAt: ["bid_submission_end", "closing_date", "end_date", "วันสิ้นสุดการเสนอราคา", "วันปิดรับข้อเสนอ"],
  sourceUpdatedAt: ["last_updated", "updated_at", "วันที่ปรับปรุง"],
  sourceUrl: ["project_url", "announce_url", "url", "ลิงก์ประกาศ"],
} as const;

function value(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return null;
}

function parseThaiDate(input: string | null, endOfDay = false): string | null {
  if (!input) return null;
  const direct = new Date(input);
  if (Number.isFinite(direct.getTime()) && /[TzZ]|[+-]\d{2}:?\d{2}$/u.test(input)) {
    return direct.toISOString();
  }
  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  const match = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/u);
  if (isoMatch) {
    const parsed = new Date(`${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}${endOfDay ? "T16:59:59.000Z" : "T00:00:00.000Z"}`);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += year >= 50 ? 2500 : 2000;
  if (year > 2400) year -= 543;
  const month = Number(match[2]);
  const day = Number(match[1]);
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}${endOfDay ? "T16:59:59.000Z" : "T00:00:00.000Z"}`);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return parsed.toISOString();
}

function parseMoney(input: string | null): number | null {
  if (!input) return null;
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";
  const normalized = input.replace(/[๐-๙]/gu, (digit) => String(thaiDigits.indexOf(digit)));
  const parsed = Number(normalized.replaceAll(",", "").replace(/[^0-9.-]/gu, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseMethod(input: string | null) {
  const normalized = input?.toLocaleLowerCase("th-TH") ?? "";
  if (/e\s*-?\s*bidding|ประกวดราคาอิเล็กทรอนิกส์/u.test(normalized)) return "e-bidding" as const;
  if (/e\s*-?\s*market|ตลาดอิเล็กทรอนิกส์/u.test(normalized)) return "e-market" as const;
  return null;
}

function parseProvince(input: string | null, title: string | null) {
  const haystack = `${input ?? ""} ${title ?? ""}`;
  return ISAN_PROVINCES.find((province) => haystack.includes(province)) ?? null;
}

export function mapCkanRecord(record: Record<string, unknown>): MappingResult {
  const sourceId = value(record, aliases.id);
  const title = value(record, aliases.title);
  const agencyName = value(record, aliases.agency);
  const province = parseProvince(value(record, aliases.province), title);
  const method = parseMethod(value(record, aliases.method) ?? title);
  const announcedAt = parseThaiDate(value(record, aliases.announcedAt));
  const closesAt = parseThaiDate(value(record, aliases.closesAt), true);
  const sourceUrl = value(record, aliases.sourceUrl);

  if (!province && value(record, aliases.province)) {
    return { ok: false, issueCode: "outside_isan", details: {} };
  }

  const missing = [
    ["source_id", sourceId],
    ["title", title],
    ["agency", agencyName],
    ["province", province],
    ["method", method],
    ["announced_at", announcedAt],
    ["closes_at", closesAt],
    ["source_url", sourceUrl],
  ].filter(([, item]) => !item).map(([name]) => name);

  if (missing.length) return { ok: false, issueCode: "missing_required_source_fields", details: { missing } };
  if (!sourceUrl!.startsWith("https://")) {
    return { ok: false, issueCode: "untrusted_source_url", details: { sourceUrl } };
  }
  if (new Date(closesAt!).getTime() <= new Date(announcedAt!).getTime()) {
    return { ok: false, issueCode: "invalid_deadline", details: { announcedAt, closesAt } };
  }

  return {
    ok: true,
    candidate: {
      sourceKind: "data-go-th-ckan",
      sourceId: sourceId!,
      title: title!,
      description: value(record, aliases.description),
      agencyName: agencyName!,
      province: province!,
      method: procurementMethodSchema.parse(method),
      budgetBaht: parseMoney(value(record, aliases.budget)),
      announcedAt: announcedAt!,
      closesAt: closesAt!,
      sourceUpdatedAt: parseThaiDate(value(record, aliases.sourceUpdatedAt)),
      sourceUrl: sourceUrl!,
      rawFingerprint: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
    },
  };
}

async function fetchWithRetry(url: URL, headers: HeadersInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Data.go.th returned HTTP ${response.status}`);
      }
      lastError = new Error(`Data.go.th returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("Data.go.th request failed");
}

export async function fetchCkanRecords(): Promise<Record<string, unknown>[]> {
  const resourceIds = (
    process.env.DATA_GO_TH_OPEN_TENDER_RESOURCE_IDS ??
    process.env.DATA_GO_TH_EBIDDING_RESOURCE_IDS ??
    ""
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!resourceIds.length) throw new Error("DATA_GO_TH_OPEN_TENDER_RESOURCE_IDS is not configured");
  const baseUrl = process.env.DATA_GO_TH_BASE_URL ?? "https://data.go.th/api/3/action";
  const headers: HeadersInit = process.env.DATA_GO_TH_API_KEY
    ? { "api-key": process.env.DATA_GO_TH_API_KEY }
    : {};
  const records: Record<string, unknown>[] = [];

  for (const resourceId of resourceIds) {
    for (let offset = 0; ; offset += 1_000) {
      const url = new URL(`${baseUrl.replace(/\/$/u, "")}/datastore_search`);
      url.searchParams.set("resource_id", resourceId);
      url.searchParams.set("limit", "1000");
      url.searchParams.set("offset", String(offset));
      const response = await fetchWithRetry(url, headers);
      const payload = (await response.json()) as {
        success?: boolean;
        result?: { records?: Record<string, unknown>[] };
      };
      if (!payload.success) throw new Error(`CKAN query failed for resource ${resourceId}`);
      const page = payload.result?.records ?? [];
      records.push(...page);
      if (page.length < 1_000) break;
    }
  }
  return records;
}
