import { describe, expect, it } from "vitest";
import { mapCkanRecord } from "@/src/lib/sources/data-go-th";

describe("Data.go.th strict mapper", () => {
  it("normalizes a supported E-Bidding record", () => {
    const result = mapCkanRecord({
      project_id: "69090001",
      project_name: "ประกวดราคาซื้อระบบห้องเรียนอัจฉริยะ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
      dept_name: "เทศบาลนครอุดรธานี",
      province: "อุดรธานี",
      method: "e-bidding",
      project_money: "๕,๐๐๐,๐๐๐",
      announce_date: "07/09/2569",
      bid_submission_end: "14/09/2569",
      project_url: "https://process5.gprocurement.go.th/example",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.budgetBaht).toBe(5_000_000);
      expect(result.candidate.province).toBe("อุดรธานี");
      expect(result.candidate.closesAt).toBe("2026-09-14T16:59:59.000Z");
    }
  });

  it("quarantines a record without a verified deadline", () => {
    const result = mapCkanRecord({
      project_id: "x",
      project_name: "ประกวดราคาซื้อระบบกล้อง CCTV",
      dept_name: "เทศบาลนครขอนแก่น",
      province: "ขอนแก่น",
      method: "e-bidding",
      announce_date: "07/09/2569",
      project_url: "https://www.gprocurement.go.th/",
    });
    expect(result).toMatchObject({ ok: false, issueCode: "missing_required_source_fields" });
  });

  it("drops records outside Isan instead of polluting review", () => {
    expect(mapCkanRecord({ province: "เชียงใหม่" })).toEqual({ ok: false, issueCode: "outside_isan", details: {} });
  });
});
