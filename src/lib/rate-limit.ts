type Bucket = { count: number; resetsAt: number };

const buckets = new Map<string, Bucket>();

export function allowRequest(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
