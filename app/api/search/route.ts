import { allowRequest } from "@/src/lib/rate-limit";
import { runSearch } from "@/src/lib/search-service";

function paramsFromUrl(url: URL): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  return params;
}

export async function GET(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowRequest(forwarded)) {
    return Response.json({ error: "ส่งคำค้นถี่เกินไป กรุณารอสักครู่" }, { status: 429 });
  }
  try {
    const { result } = await runSearch(paramsFromUrl(new URL(request.url)));
    return Response.json(result, { headers: { "cache-control": "private, max-age=30" } });
  } catch {
    return Response.json({ error: "ค้นหาข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
