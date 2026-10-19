import { timingSafeEqual } from "node:crypto";
import { refreshTaxonomyFromPrivateUrl } from "@/src/jobs/discover-taxonomy";
import { syncTenders } from "@/src/jobs/sync-tenders";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "") ?? "";
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const taxonomyRefreshed = await refreshTaxonomyFromPrivateUrl();
    const result = await syncTenders();
    return Response.json({ taxonomyRefreshed, ...result }, { status: result.status === "discovery_only" ? 503 : 200 });
  } catch {
    return Response.json({ error: "Synchronization failed; the previous snapshot remains active" }, { status: 500 });
  }
}
