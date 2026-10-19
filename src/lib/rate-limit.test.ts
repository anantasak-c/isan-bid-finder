import { expect, it } from "vitest";
import { allowRequest } from "@/src/lib/rate-limit";

it("rejects requests after the fixed-window limit", () => {
  const key = `test-${crypto.randomUUID()}`;
  expect(allowRequest(key, 2, 60_000)).toBe(true);
  expect(allowRequest(key, 2, 60_000)).toBe(true);
  expect(allowRequest(key, 2, 60_000)).toBe(false);
});
