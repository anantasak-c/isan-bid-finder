import { expect, it } from "vitest";
import { parseDiscoverySeed } from "@/src/jobs/discover-taxonomy";

it("extracts unique contract titles without carrying company identity fields", () => {
  const raw = [
    JSON.stringify({ title: "ซื้อระบบห้องประชุม", winner_name: "นิติบุคคลส่วนตัว" }),
    JSON.stringify({ title: "ซื้อระบบห้องประชุม", tax_id: "0000000000000" }),
    JSON.stringify({ normalized: { projectTitle: "เช่าเครื่องพิมพ์" } }),
  ].join("\n");
  expect(parseDiscoverySeed(raw)).toEqual(["ซื้อระบบห้องประชุม", "เช่าเครื่องพิมพ์"]);
});
