import { classifyTitle, embedForRetrieval } from "@/src/lib/gemini";
import { getSupabaseAdmin } from "@/src/lib/supabase";
import { fetchCkanRecords, mapCkanRecord, type SourceCandidate } from "@/src/lib/sources/data-go-th";
import type { Category } from "@/src/domain/opportunity";
import { syncRss } from "@/src/jobs/sync-rss";

type ActiveCategory = Category & { id: string };

async function concurrentMap<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function activeTaxonomy(): Promise<{ versionId: string; categories: ActiveCategory[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for synchronization");
  const { data: version, error: versionError } = await supabase
    .from("taxonomy_versions")
    .select("id")
    .eq("status", "active")
    .single();
  if (versionError) throw versionError;
  const { data, error } = await supabase
    .from("categories")
    .select("id,slug,name,description,include_terms,exclude_terms,evidence_count")
    .eq("taxonomy_version_id", version.id);
  if (error) throw error;
  return {
    versionId: version.id,
    categories: (data ?? []).map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      includeTerms: item.include_terms,
      excludeTerms: item.exclude_terms,
      evidenceCount: item.evidence_count,
    })),
  };
}

export async function syncTenders(): Promise<{
  runId: string;
  fetched: number;
  accepted: number;
  review: number;
  status?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for synchronization");
  if (!process.env.DATA_GO_TH_OPEN_TENDER_RESOURCE_IDS && !process.env.DATA_GO_TH_EBIDDING_RESOURCE_IDS) {
    return syncRss();
  }
  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (runError) throw runError;

  try {
    const [{ categories }, rawRecords] = await Promise.all([activeTaxonomy(), fetchCkanRecords()]);
    if (!categories.length) throw new Error("The active taxonomy has no categories");
    if (!rawRecords.length) throw new Error("The official source returned zero records");

    const mapped = rawRecords.map(mapCkanRecord);
    const candidates = mapped
      .filter((item): item is { ok: true; candidate: SourceCandidate } => item.ok)
      .map((item) => item.candidate)
      .filter((item) => new Date(item.closesAt).getTime() > Date.now());
    const mappingIssues = mapped.filter(
      (item): item is Extract<typeof item, { ok: false }> => !item.ok && item.issueCode !== "outside_isan",
    );

    const classified = await concurrentMap(candidates, 5, async (candidate) => {
      const classification = await classifyTitle(candidate.title, categories);
      if (!classification.matched || classification.confidence < 0.9) {
        return { candidate, classification, accepted: false as const };
      }
      const category = categories.find((item) => item.slug === classification.categorySlug);
      if (!category) return { candidate, classification, accepted: false as const };
      const embedding = process.env.ENABLE_EMBEDDINGS === "true"
        ? await embedForRetrieval(`${candidate.title}\n${candidate.description ?? ""}`)
        : null;
      return { candidate, classification, category, embedding, accepted: true as const };
    });

    const reviewRows = [
      ...mappingIssues.map((item) => ({
        sync_run_id: run.id,
        source_kind: "data-go-th-ckan",
        source_id: null,
        title: null,
        issue_code: item.issueCode,
        details: item.details,
      })),
      ...classified.filter((item) => !item.accepted).map((item) => ({
        sync_run_id: run.id,
        source_kind: item.candidate.sourceKind,
        source_id: item.candidate.sourceId,
        title: item.candidate.title,
        issue_code: "classification_below_threshold",
        details: item.classification,
      })),
    ];

    if (reviewRows.length) {
      const { error } = await supabase.from("review_queue").insert(reviewRows);
      if (error) throw error;
    }

    for (const item of classified.filter((entry) => entry.accepted)) {
      const { candidate, category, classification, embedding } = item;
      const { data: opportunity, error: opportunityError } = await supabase
        .from("opportunities")
        .insert({
          sync_run_id: run.id,
          source_kind: candidate.sourceKind,
          source_id: candidate.sourceId,
          title: candidate.title,
          description: candidate.description,
          agency_name: candidate.agencyName,
          province: candidate.province,
          method: candidate.method,
          budget_baht: candidate.budgetBaht,
          announced_at: candidate.announcedAt,
          closes_at: candidate.closesAt,
          source_updated_at: candidate.sourceUpdatedAt,
          source_url: candidate.sourceUrl,
          raw_fingerprint: candidate.rawFingerprint,
          embedding,
        })
        .select("id")
        .single();
      if (opportunityError) throw opportunityError;
      const { error: classificationError } = await supabase.from("classifications").insert({
        opportunity_id: opportunity.id,
        category_id: category.id,
        confidence: classification.confidence,
        reason: classification.reason,
        model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      });
      if (classificationError) throw classificationError;
    }

    const acceptedCount = classified.filter((item) => item.accepted).length;
    const sourceUpdatedAt = candidates
      .map((item) => item.sourceUpdatedAt)
      .filter((item): item is string => Boolean(item))
      .sort()
      .at(-1) ?? null;
    const { error: finishError } = await supabase
      .from("sync_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        source_updated_at: sourceUpdatedAt,
        fetched_count: rawRecords.length,
        accepted_count: acceptedCount,
        review_count: reviewRows.length,
      })
      .eq("id", run.id);
    if (finishError) throw finishError;
    return { runId: run.id, fetched: rawRecords.length, accepted: acceptedCount, review: reviewRows.length };
  } catch (error) {
    await supabase
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown synchronization error",
      })
      .eq("id", run.id);
    throw error;
  }
}
