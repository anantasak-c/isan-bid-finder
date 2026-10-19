import { z } from "zod";
import {
  ISAN_PROVINCES,
  type Category,
  type SearchFilters,
  type TaxonomyDraft,
} from "@/src/domain/opportunity";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

type JsonSchema = Record<string, unknown>;

async function retryDelayMs(response: Response, attempt: number): Promise<number> {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1_000 + 250;
  if (response.status === 429) {
    try {
      const payload = await response.clone().json() as {
        error?: { details?: { retryDelay?: string }[] };
      };
      const retryDelay = payload.error?.details?.find((detail) => detail.retryDelay)?.retryDelay;
      const match = retryDelay?.match(/^(\d+(?:\.\d+)?)s$/u);
      if (match) return Math.ceil(Number(match[1]) * 1_000) + 250;
    } catch {
      // Fall through to conservative exponential backoff.
    }
    return Math.min(60_000, 15_000 * 2 ** attempt);
  }
  return Math.min(10_000, 750 * 2 ** attempt);
}

function outputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("Gemini returned an empty response");
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (typeof record.text === "string") return record.text;
  const candidates = record.candidates;
  if (Array.isArray(candidates)) {
    const first = candidates[0] as { content?: { parts?: { text?: string }[] } } | undefined;
    const text = first?.content?.parts?.map((part) => part.text ?? "").join("");
    if (text) return text;
  }
  throw new Error("Gemini response did not include output_text");
}

async function generateStructured<T>(
  prompt: string,
  jsonSchema: JsonSchema,
  schema: z.ZodType<T>,
  timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 12_000),
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const models = [...new Set([
    process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash",
  ])];
  let lastError: Error | undefined;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let delayMs = Math.min(10_000, 750 * 2 ** attempt);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs,
      );
      try {
        const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: jsonSchema,
            },
          }),
        });

        if (response.ok) return schema.parse(JSON.parse(outputText(await response.json())));
        lastError = new Error(`Gemini ${model} request failed with HTTP ${response.status}`);
        if (response.status !== 429 && response.status < 500) throw lastError;
        delayMs = await retryDelayMs(response, attempt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(`Gemini ${model} request failed`);
        if (attempt === 2) break;
      } finally {
        clearTimeout(timeout);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error("Gemini request failed");
}

const interpretedQuerySchema = z.object({
  text: z.string().max(300),
  provinces: z.array(z.enum(ISAN_PROVINCES)),
  category: z.string().max(100),
  agency: z.string().max(200),
  minBudget: z.number().nonnegative().nullable(),
  maxBudget: z.number().nonnegative().nullable(),
  closesWithinDays: z.number().int().min(1).max(365).nullable(),
});

export async function interpretNaturalLanguageQuery(
  query: string,
  categories: Pick<Category, "slug" | "name">[],
): Promise<Partial<SearchFilters>> {
  const categoryValues = categories.map((category) => category.slug);
  const result = await generateStructured(
    [
      "แปลงคำค้นงานจัดซื้อจัดจ้างภาษาไทยเป็นตัวกรองเท่านั้น",
      `จังหวัดที่อนุญาต: ${ISAN_PROVINCES.join(", ")}`,
      `หมวดที่อนุญาต: ${categories.map((item) => `${item.slug}=${item.name}`).join(", ")}`,
      "ถ้าผู้ใช้ไม่ได้ระบุค่า ให้คืนข้อความว่าง อาร์เรย์ว่าง หรือ null ตามชนิด ห้ามสร้างจังหวัดหรือหมวดใหม่",
      `คำค้น: ${query}`,
    ].join("\n"),
    {
      type: "object",
      properties: {
        text: { type: "string" },
        provinces: { type: "array", items: { type: "string", enum: ISAN_PROVINCES } },
        category: { type: "string", enum: ["", ...categoryValues] },
        agency: { type: "string" },
        minBudget: { type: ["number", "null"] },
        maxBudget: { type: ["number", "null"] },
        closesWithinDays: { type: ["integer", "null"] },
      },
      required: [
        "text",
        "provinces",
        "category",
        "agency",
        "minBudget",
        "maxBudget",
        "closesWithinDays",
      ],
    },
    interpretedQuerySchema,
  );

  return {
    q: result.text,
    provinces: result.provinces,
    category: result.category,
    agency: result.agency,
    minBudget: result.minBudget,
    maxBudget: result.maxBudget,
    closesWithinDays: result.closesWithinDays,
  };
}

const categorySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(120),
  description: z.string().min(5).max(500),
  includeTerms: z.array(z.string().min(2).max(100)).min(1).max(100),
  excludeTerms: z.array(z.string().min(2).max(100)).max(100),
  evidenceCount: z.number().int().nonnegative(),
});

const taxonomyDraftSchema = z.object({
  summary: z.string().min(5).max(1_000),
  categories: z.array(categorySchema).min(1).max(100),
});

export async function discoverTaxonomyBatch(contractTitles: string[]): Promise<TaxonomyDraft> {
  return generateStructured(
    [
      "คุณกำลังสร้าง Business Taxonomy สำหรับค้นหาโอกาสประมูลภาครัฐ",
      "สกัดทุกสายสินค้าและบริการที่มีหลักฐานจากชื่อสัญญาด้านล่าง รวมคำพ้อง คำสะกด และคำยกเว้น",
      "ห้ามอ้างชื่อบริษัท ห้ามสร้างหมวดที่ไม่มีหลักฐาน และรวมหมวดที่ทับซ้อนกัน",
      "evidenceCount คือจำนวนชื่อสัญญาที่สนับสนุนหมวดนั้น",
      ...contractTitles.map((title, index) => `${index + 1}. ${title}`),
    ].join("\n"),
    {
      type: "object",
      properties: {
        summary: { type: "string" },
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slug: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              includeTerms: { type: "array", items: { type: "string" } },
              excludeTerms: { type: "array", items: { type: "string" } },
              evidenceCount: { type: "integer" },
            },
            required: ["slug", "name", "description", "includeTerms", "excludeTerms", "evidenceCount"],
          },
        },
      },
      required: ["summary", "categories"],
    },
    taxonomyDraftSchema,
    Number(process.env.GEMINI_TAXONOMY_TIMEOUT_MS ?? 120_000),
  );
}

export async function mergeTaxonomyDrafts(drafts: TaxonomyDraft[]): Promise<TaxonomyDraft> {
  return generateStructured(
    [
      "รวม Business Taxonomy หลายชุดด้านล่างเป็นชุดเดียวสำหรับค้นหาโอกาสประมูลภาครัฐ",
      "รวมหมวดที่มีความหมายทับซ้อนกัน รวมคำค้นและคำยกเว้นโดยไม่ซ้ำ และรวม evidenceCount ของหลักฐานที่เกี่ยวข้อง",
      "ห้ามสร้างหมวดใหม่ที่ไม่มีอยู่ในข้อมูล ห้ามอ้างชื่อบริษัท และใช้ slug ภาษาอังกฤษแบบ kebab-case",
      JSON.stringify(drafts),
    ].join("\n"),
    {
      type: "object",
      properties: {
        summary: { type: "string" },
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slug: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              includeTerms: { type: "array", items: { type: "string" } },
              excludeTerms: { type: "array", items: { type: "string" } },
              evidenceCount: { type: "integer" },
            },
            required: ["slug", "name", "description", "includeTerms", "excludeTerms", "evidenceCount"],
          },
        },
      },
      required: ["summary", "categories"],
    },
    taxonomyDraftSchema,
    Number(process.env.GEMINI_TAXONOMY_TIMEOUT_MS ?? 120_000),
  );
}

export async function discoverTaxonomy(contractTitles: string[]): Promise<TaxonomyDraft> {
  if (!contractTitles.length) throw new Error("Discovery Seed has no contract titles");
  const batchSize = Number(process.env.GEMINI_TAXONOMY_BATCH_SIZE ?? 150);
  if (!Number.isInteger(batchSize) || batchSize < 50 || batchSize > 1_000) {
    throw new Error("GEMINI_TAXONOMY_BATCH_SIZE must be an integer from 50 to 1000");
  }
  if (contractTitles.length <= batchSize) return discoverTaxonomyBatch(contractTitles);

  let drafts: TaxonomyDraft[] = [];
  for (let offset = 0; offset < contractTitles.length; offset += batchSize) {
    drafts.push(await discoverTaxonomyBatch(contractTitles.slice(offset, offset + batchSize)));
  }
  while (drafts.length > 1) {
    const merged: TaxonomyDraft[] = [];
    for (let offset = 0; offset < drafts.length; offset += 5) {
      const group = drafts.slice(offset, offset + 5);
      merged.push(group.length === 1 ? group[0] : await mergeTaxonomyDrafts(group));
    }
    drafts = merged;
  }
  return drafts[0];
}

const classificationSchema = z.object({
  matched: z.boolean(),
  categorySlug: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500),
});

export async function classifyTitle(title: string, categories: Category[]) {
  const slugs = categories.map((category) => category.slug);
  return generateStructured(
    [
      "จัดหมวดชื่อประกาศจัดซื้อจัดจ้างตาม taxonomy ที่ให้เท่านั้น",
      "ถ้าไม่ตรงหรือกำกวม ให้ matched=false, categorySlug='' และ confidence ต่ำ",
      JSON.stringify(categories),
      `ชื่อประกาศ: ${title}`,
    ].join("\n"),
    {
      type: "object",
      properties: {
        matched: { type: "boolean" },
        categorySlug: { type: "string", enum: ["", ...slugs] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" },
      },
      required: ["matched", "categorySlug", "confidence", "reason"],
    },
    classificationSchema,
  );
}

export async function embedForRetrieval(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:embedContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      content: { parts: [{ text: `task: retrieval document | title: ${text}` }] },
      output_dimensionality: 768,
    }),
  });
  if (!response.ok) throw new Error(`Gemini embedding failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { embedding?: { values?: number[] } };
  const values = payload.embedding?.values;
  if (!values || values.length !== 768) throw new Error("Gemini returned an invalid embedding");
  return values;
}
