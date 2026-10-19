import type { Category, Opportunity, SearchFilters, SearchResult } from "@/src/domain/opportunity";
import { filterAndRankOpportunities } from "@/src/domain/search";
import { demoCategories, demoOpportunities } from "@/src/lib/demo-data";
import { demoDataAllowed, getSupabaseAdmin } from "@/src/lib/supabase";

type SearchRow = {
  id: string;
  source_id: string;
  title: string;
  description: string | null;
  agency_name: string;
  province: Opportunity["province"];
  method: Opportunity["method"];
  budget_baht: number | null;
  announced_at: string;
  closes_at: string;
  source_updated_at: string | null;
  source_url: string;
  category_slug: string;
  category_name: string;
  confidence: number;
  relevance: number;
  total_count: number;
};

function mapSearchRow(row: SearchRow): Opportunity {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    agencyName: row.agency_name,
    province: row.province,
    method: row.method,
    budgetBaht: row.budget_baht,
    announcedAt: row.announced_at,
    closesAt: row.closes_at,
    sourceUpdatedAt: row.source_updated_at,
    sourceUrl: row.source_url,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    confidence: Number(row.confidence),
    relevance: Number(row.relevance),
  };
}

export async function listCategories(): Promise<Pick<Category, "slug" | "name">[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (demoDataAllowed()) return demoCategories;
    throw new Error("Supabase is not configured");
  }
  const { data, error } = await supabase
    .from("active_categories")
    .select("slug,name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function searchOpportunities(filters: SearchFilters): Promise<SearchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (!demoDataAllowed()) throw new Error("Supabase is not configured and demo data is disabled");
    const allItems = filterAndRankOpportunities(demoOpportunities(), filters);
    const items = allItems.slice(filters.offset, filters.offset + filters.limit);
    return {
      items,
      total: allItems.length,
      source: "demo",
      interpretedByAi: false,
      syncedAt: new Date().toISOString(),
      sourceUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      warning: "กำลังแสดงข้อมูลตัวอย่างสำหรับ development เท่านั้น",
    };
  }

  const { data, error } = await supabase.rpc("search_open_opportunities", {
    search_text: filters.q || null,
    province_filter: filters.provinces.length ? filters.provinces : null,
    category_filter: filters.category || null,
    agency_filter: filters.agency || null,
    min_budget_filter: filters.minBudget,
    max_budget_filter: filters.maxBudget,
    closes_before_filter: filters.closesWithinDays
      ? new Date(Date.now() + filters.closesWithinDays * 86_400_000).toISOString()
      : null,
    sort_filter: filters.sort,
    page_limit: filters.limit,
    page_offset: filters.offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as SearchRow[];

  const { data: status } = await supabase
    .from("latest_sync_status")
    .select("finished_at,source_updated_at,status,error_message")
    .maybeSingle();

  return {
    items: rows.map(mapSearchRow),
    total: rows[0]?.total_count ?? 0,
    source: "supabase",
    interpretedByAi: false,
    syncedAt: status?.finished_at ?? null,
    sourceUpdatedAt: status?.source_updated_at ?? null,
    warning: status?.error_message?.startsWith("RSS discovery saved")
      ? "รับประกาศบางหน่วยงานแล้ว กำลังรอตรวจวันปิดรับและสถานะ ข้อมูลยังไม่ครอบคลุมทุกหน่วยงานในภาคอีสาน"
      : status?.status === "failed" ? "การซิงก์ล่าสุดไม่สำเร็จ ข้อมูลที่แสดงอาจยังไม่เป็นปัจจุบัน" : null,
  };
}
