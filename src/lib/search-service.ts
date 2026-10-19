import type { SearchFilters, SearchResult } from "@/src/domain/opportunity";
import { parseSearchFilters, shouldInterpretWithAi } from "@/src/domain/search";
import { interpretNaturalLanguageQuery } from "@/src/lib/gemini";
import { listCategories, searchOpportunities } from "@/src/lib/opportunity-repository";

type RawSearchParams = Record<string, string | string[] | undefined>;

function mergeAiFilters(base: SearchFilters, ai: Partial<SearchFilters>): SearchFilters {
  return {
    ...base,
    q: ai.q || base.q,
    provinces: base.provinces.length ? base.provinces : (ai.provinces ?? []),
    category: base.category || ai.category || "",
    agency: base.agency || ai.agency || "",
    minBudget: base.minBudget ?? ai.minBudget ?? null,
    maxBudget: base.maxBudget ?? ai.maxBudget ?? null,
    closesWithinDays: base.closesWithinDays ?? ai.closesWithinDays ?? null,
  };
}

export async function runSearch(params: RawSearchParams): Promise<{
  displayFilters: SearchFilters;
  effectiveFilters: SearchFilters;
  categories: Awaited<ReturnType<typeof listCategories>>;
  result: SearchResult;
}> {
  const displayFilters = parseSearchFilters(params);
  const categories = await listCategories();
  let effectiveFilters = displayFilters;
  let interpretedByAi = false;
  let aiWarning: string | null = null;

  if (process.env.GEMINI_API_KEY && shouldInterpretWithAi(displayFilters.q)) {
    try {
      effectiveFilters = mergeAiFilters(
        displayFilters,
        await interpretNaturalLanguageQuery(displayFilters.q, categories),
      );
      interpretedByAi = true;
    } catch {
      aiWarning = "Gemini ไม่พร้อมใช้งาน จึงค้นหาด้วยข้อความและตัวกรองปกติ";
    }
  }

  const result = await searchOpportunities(effectiveFilters);
  result.interpretedByAi = interpretedByAi;
  result.warning = [result.warning, aiWarning].filter(Boolean).join(" · ") || null;
  return { displayFilters, effectiveFilters, categories, result };
}
