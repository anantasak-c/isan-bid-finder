import { eventTypes, fetchRss, rssAgencies } from "@/src/lib/sources/egp-rss";
import { getSupabaseAdmin } from "@/src/lib/supabase";

// Discovery runs never become an open-opportunity snapshot. Review records retain
// source evidence until PDF deadlines and project status can be verified.
export async function syncRss(date?: string) {
  const day = date ?? new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Supabase is required");
  const { data: run, error } = await db.from("sync_runs").insert({ status: "running" }).select("id").single();
  if (error) throw error;
  let fetched = 0;
  let review = 0;
  try {
    for (const agency of rssAgencies) for (const method of ["15", "16"] as const) for (const type of eventTypes) {
      let batch;
      try { batch = await fetchRss(agency.id, day, method, type); }
      catch { batch = { items: [], expected: null, coverage: "failed", sourceUrl: null }; }
      fetched += batch.items.length;
      const rows = [
        { sync_run_id: run.id, source_kind: "egp-rss", source_id: agency.id, title: null, issue_code: "rss_query_coverage", details: { agency, date: day, method, type, expected: batch.expected, returned: batch.items.length, coverage: batch.coverage, sourceUrl: batch.sourceUrl } },
        ...batch.items.map(item => ({ sync_run_id: run.id, source_kind: "egp-rss", source_id: item.projectId, title: item.title, issue_code: "rss_requires_official_detail", details: { ...item, agency, method, type, fiscalYear: null, closesAt: null } })),
      ];
      const { error: saveError } = await db.from("review_queue").insert(rows);
      if (saveError) throw saveError;
      review += rows.length;
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    const message = "RSS discovery saved; limited agency coverage; official PDF enrichment pending. No open snapshot published.";
    const { error: finishError } = await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), fetched_count: fetched, review_count: review, error_message: message }).eq("id", run.id);
    if (finishError) throw finishError;
    return { runId: run.id, fetched, review, accepted: 0, status: "discovery_only", coverage: "verified_agencies_only", date: day };
  } catch (failure) {
    await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), fetched_count: fetched, review_count: review, error_message: "RSS discovery could not finish" }).eq("id", run.id);
    throw failure;
  }
}
