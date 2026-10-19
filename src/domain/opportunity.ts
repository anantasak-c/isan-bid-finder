import { z } from "zod";

export const ISAN_PROVINCES = [
  "กาฬสินธุ์",
  "ขอนแก่น",
  "ชัยภูมิ",
  "นครพนม",
  "นครราชสีมา",
  "บึงกาฬ",
  "บุรีรัมย์",
  "มหาสารคาม",
  "มุกดาหาร",
  "ยโสธร",
  "ร้อยเอ็ด",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุบลราชธานี",
] as const;

export const procurementMethodSchema = z.enum(["e-bidding", "e-market"]);
export type ProcurementMethod = z.infer<typeof procurementMethodSchema>;

export const opportunitySchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  agencyName: z.string(),
  province: z.enum(ISAN_PROVINCES),
  method: procurementMethodSchema,
  budgetBaht: z.number().nonnegative().nullable(),
  announcedAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime().nullable(),
  sourceUrl: z.string().url(),
  categorySlug: z.string(),
  categoryName: z.string(),
  confidence: z.number().min(0).max(1),
  relevance: z.number().min(0).default(0),
});

export type Opportunity = z.infer<typeof opportunitySchema>;

export const searchFiltersSchema = z.object({
  q: z.string().trim().max(300).default(""),
  provinces: z.array(z.enum(ISAN_PROVINCES)).default([]),
  category: z.string().trim().max(100).default(""),
  agency: z.string().trim().max(200).default(""),
  minBudget: z.number().nonnegative().nullable().default(null),
  maxBudget: z.number().nonnegative().nullable().default(null),
  closesWithinDays: z.number().int().min(1).max(365).nullable().default(null),
  sort: z.enum(["relevance", "newest", "budget"]).default("relevance"),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export type SearchResult = {
  items: Opportunity[];
  total: number;
  source: "supabase" | "demo";
  interpretedByAi: boolean;
  syncedAt: string | null;
  sourceUpdatedAt: string | null;
  warning: string | null;
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  includeTerms: string[];
  excludeTerms: string[];
  evidenceCount: number;
};

export type TaxonomyDraft = {
  summary: string;
  categories: Category[];
};
