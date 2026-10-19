import {
  ISAN_PROVINCES,
  type Opportunity,
  type SearchFilters,
  searchFiltersSchema,
} from "@/src/domain/opportunity";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function numberOrNull(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value.replaceAll(",", ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function integer(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function integerOrNull(value: string | undefined, minimum: number, maximum: number): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export function parseSearchFilters(params: RawSearchParams): SearchFilters {
  const rawProvinces = Array.isArray(params.province)
    ? params.province
    : params.province
      ? [params.province]
      : [];
  const provinceSet = new Set<string>(ISAN_PROVINCES);

  return searchFiltersSchema.parse({
    q: first(params.q) ?? "",
    provinces: rawProvinces.filter((province) => provinceSet.has(province)),
    category: first(params.category) ?? "",
    agency: first(params.agency) ?? "",
    minBudget: numberOrNull(first(params.minBudget)),
    maxBudget: numberOrNull(first(params.maxBudget)),
    closesWithinDays: integerOrNull(first(params.closesWithinDays), 1, 365),
    sort: ["relevance", "newest", "budget"].includes(first(params.sort) ?? "")
      ? first(params.sort)
      : "relevance",
    limit: Math.min(100, Math.max(1, integer(first(params.limit), 30))),
    offset: Math.min(10_000, Math.max(0, integer(first(params.offset), 0))),
  });
}

export function isOpenOpportunity(
  opportunity: Pick<Opportunity, "closesAt" | "method">,
  now = new Date(),
): boolean {
  const closesAt = new Date(opportunity.closesAt);
  return (
    Number.isFinite(closesAt.getTime()) &&
    closesAt.getTime() > now.getTime() &&
    (opportunity.method === "e-bidding" || opportunity.method === "e-market")
  );
}

function textScore(opportunity: Opportunity, query: string): number {
  const terms = query
    .toLocaleLowerCase("th-TH")
    .split(/\s+/u)
    .filter(Boolean);
  if (!terms.length) return 0;
  const title = opportunity.title.toLocaleLowerCase("th-TH");
  const haystack = [
    title,
    opportunity.description ?? "",
    opportunity.agencyName,
    opportunity.categoryName,
  ]
    .join(" ")
    .toLocaleLowerCase("th-TH");

  return terms.reduce((score, term) => {
    if (title.includes(term)) return score + 4;
    if (haystack.includes(term)) return score + 1;
    return score;
  }, 0);
}

export function filterAndRankOpportunities(
  opportunities: Opportunity[],
  filters: SearchFilters,
  now = new Date(),
): Opportunity[] {
  const deadline = filters.closesWithinDays
    ? now.getTime() + filters.closesWithinDays * 86_400_000
    : null;

  const filtered = opportunities
    .filter((item) => isOpenOpportunity(item, now))
    .filter((item) => !filters.provinces.length || filters.provinces.includes(item.province))
    .filter((item) => !filters.category || item.categorySlug === filters.category)
    .filter(
      (item) =>
        !filters.agency ||
        item.agencyName.toLocaleLowerCase("th-TH").includes(filters.agency.toLocaleLowerCase("th-TH")),
    )
    .filter((item) => filters.minBudget === null || (item.budgetBaht ?? -1) >= filters.minBudget)
    .filter((item) => filters.maxBudget === null || (item.budgetBaht ?? Infinity) <= filters.maxBudget)
    .filter((item) => deadline === null || new Date(item.closesAt).getTime() <= deadline)
    .map((item) => ({ ...item, relevance: item.confidence * 10 + textScore(item, filters.q) }))
    .filter((item) => !filters.q || textScore(item, filters.q) > 0);

  return filtered.sort((left, right) => {
    if (filters.sort === "newest") {
      return new Date(right.announcedAt).getTime() - new Date(left.announcedAt).getTime();
    }
    if (filters.sort === "budget") {
      return (right.budgetBaht ?? -1) - (left.budgetBaht ?? -1);
    }
    return (
      right.relevance - left.relevance ||
      new Date(left.closesAt).getTime() - new Date(right.closesAt).getTime()
    );
  });
}

export function shouldInterpretWithAi(query: string): boolean {
  const trimmed = query.trim();
  return (
    trimmed.split(/\s+/u).length >= 4 ||
    /(?:หา|ต้องการ|งบ|ภายใน|ก่อน|จังหวัด|ใกล้ปิด|งานเกี่ยวกับ)/u.test(trimmed)
  );
}
