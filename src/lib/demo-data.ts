import type { Opportunity } from "@/src/domain/opportunity";

function isoFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function demoOpportunities(): Opportunity[] {
  return [
    {
      id: "demo-smart-classroom",
      sourceId: "DEMO-001",
      title: "ประกวดราคาซื้อชุดห้องเรียนอัจฉริยะพร้อมจอสัมผัส",
      description: "ระบบนำเสนอภาพและอุปกรณ์ควบคุมสำหรับห้องเรียน",
      agencyName: "วิทยาลัยเทคนิคอุดรธานี",
      province: "อุดรธานี",
      method: "e-bidding",
      budgetBaht: 4_850_000,
      announcedAt: isoFromNow(-2),
      closesAt: isoFromNow(8),
      sourceUpdatedAt: isoFromNow(-1),
      sourceUrl: "https://www.gprocurement.go.th/",
      categorySlug: "interactive-display",
      categoryName: "จอ Interactive และ Smart Classroom",
      confidence: 0.98,
      relevance: 0,
    },
    {
      id: "demo-cctv",
      sourceId: "DEMO-002",
      title: "ประกวดราคาจ้างติดตั้งระบบกล้องโทรทัศน์วงจรปิด",
      description: "กล้อง CCTV ระบบบันทึกภาพ และเครือข่ายภายใน",
      agencyName: "เทศบาลนครขอนแก่น",
      province: "ขอนแก่น",
      method: "e-bidding",
      budgetBaht: 7_200_000,
      announcedAt: isoFromNow(-4),
      closesAt: isoFromNow(4),
      sourceUpdatedAt: isoFromNow(-1),
      sourceUrl: "https://www.gprocurement.go.th/",
      categorySlug: "security-system",
      categoryName: "ระบบรักษาความปลอดภัย",
      confidence: 0.96,
      relevance: 0,
    },
    {
      id: "demo-printing",
      sourceId: "DEMO-003",
      title: "ประกวดราคาซื้อเครื่องพิมพ์มัลติฟังก์ชันและวัสดุสิ้นเปลือง",
      description: "เครื่องพิมพ์เลเซอร์สีพร้อมระบบบริหารจัดการการพิมพ์",
      agencyName: "มหาวิทยาลัยราชภัฏนครราชสีมา",
      province: "นครราชสีมา",
      method: "e-market",
      budgetBaht: 1_250_000,
      announcedAt: isoFromNow(-1),
      closesAt: isoFromNow(12),
      sourceUpdatedAt: isoFromNow(-1),
      sourceUrl: "https://www.gprocurement.go.th/",
      categorySlug: "printing",
      categoryName: "เครื่องพิมพ์และงานพิมพ์",
      confidence: 0.95,
      relevance: 0,
    },
  ];
}

export const demoCategories = [
  { slug: "interactive-display", name: "จอ Interactive และ Smart Classroom" },
  { slug: "security-system", name: "ระบบรักษาความปลอดภัย" },
  { slug: "printing", name: "เครื่องพิมพ์และงานพิมพ์" },
];
