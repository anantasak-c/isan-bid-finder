import { ISAN_PROVINCES, type Opportunity, type SearchFilters } from "@/src/domain/opportunity";
import { runSearch } from "@/src/lib/search-service";
import Link from "next/link";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});
const moneyFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

function formatMoney(amount: number | null) {
  return amount === null ? "ไม่ระบุวงเงิน" : `${moneyFormatter.format(amount)} บาท`;
}

function daysUntil(iso: string) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function SearchForm({
  filters,
  categories,
}: {
  filters: SearchFilters;
  categories: { slug: string; name: string }[];
}) {
  return (
    <form className="search-panel" aria-label="ค้นหางานประมูล">
      <label className="query-field">
        <span>ค้นหางานที่คุณสนใจ</span>
        <div className="query-row">
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={300}
            placeholder="เช่น หางานระบบห้องประชุมในอุดร งบไม่เกิน 5 ล้านบาท"
          />
          <button type="submit">ค้นหา</button>
        </div>
        <small>พิมพ์ชื่อสินค้า ลักษณะงาน หรือประโยคธรรมชาติได้</small>
      </label>

      <div className="filter-grid">
        <label>
          <span>จังหวัด</span>
          <select name="province" defaultValue={filters.provinces[0] ?? ""}>
            <option value="">ทุกจังหวัดในอีสาน</option>
            {ISAN_PROVINCES.map((province) => <option key={province}>{province}</option>)}
          </select>
        </label>
        <label>
          <span>หมวดงาน</span>
          <select name="category" defaultValue={filters.category}>
            <option value="">ทุกหมวดที่ AI ค้นพบ</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>หน่วยงาน</span>
          <input name="agency" defaultValue={filters.agency} placeholder="ชื่อหน่วยงาน" />
        </label>
        <label>
          <span>ปิดรับภายใน</span>
          <select name="closesWithinDays" defaultValue={filters.closesWithinDays ?? ""}>
            <option value="">ไม่จำกัด</option>
            <option value="7">7 วัน</option>
            <option value="14">14 วัน</option>
            <option value="30">30 วัน</option>
            <option value="60">60 วัน</option>
          </select>
        </label>
        <label>
          <span>งบประมาณต่ำสุด</span>
          <input name="minBudget" inputMode="numeric" defaultValue={filters.minBudget ?? ""} placeholder="บาท" />
        </label>
        <label>
          <span>งบประมาณสูงสุด</span>
          <input name="maxBudget" inputMode="numeric" defaultValue={filters.maxBudget ?? ""} placeholder="บาท" />
        </label>
        <label>
          <span>เรียงตาม</span>
          <select name="sort" defaultValue={filters.sort}>
            <option value="relevance">ตรงกับงานมากที่สุด</option>
            <option value="newest">ประกาศล่าสุด</option>
            <option value="budget">งบประมาณสูงสุด</option>
          </select>
        </label>
      </div>
    </form>
  );
}

function OpportunityCard({ item }: { item: Opportunity }) {
  return (
    <article className="opportunity-card">
      <div className="card-topline">
        <span className="category-chip">{item.categoryName}</span>
        <span className="deadline-chip">เหลือ {daysUntil(item.closesAt)} วัน</span>
      </div>
      <h2>{item.title}</h2>
      <p className="agency">{item.agencyName} · {item.province}</p>
      {item.description ? <p className="description">{item.description}</p> : null}
      <dl className="facts">
        <div><dt>วงเงิน</dt><dd>{formatMoney(item.budgetBaht)}</dd></div>
        <div><dt>วิธี</dt><dd>{item.method === "e-bidding" ? "E-Bidding" : "E-Market"}</dd></div>
        <div><dt>ประกาศ</dt><dd>{dateFormatter.format(new Date(item.announcedAt))}</dd></div>
        <div><dt>ปิดรับ</dt><dd>{dateTimeFormatter.format(new Date(item.closesAt))}</dd></div>
      </dl>
      <div className="card-footer">
        <span>ความมั่นใจ {Math.round(item.confidence * 100)}%</span>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">ดูประกาศต้นทาง <span aria-hidden>↗</span></a>
      </div>
    </article>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const experience = await runSearch(await searchParams);
  const { displayFilters, result, categories } = experience;

  return (
    <main>
      <header className="hero">
        <nav><Link className="brand" href="/">ISAN<span>BID</span></Link><span className="live-mark">ข้อมูลทางการ · อัปเดตรายวัน</span></nav>
        <div className="hero-copy">
          <p className="eyebrow">โอกาสภาครัฐในภาคอีสาน</p>
          <h1>เจองานที่ใช่<br />ก่อนหมดเวลา</h1>
          <p>ค้นหา E-Bidding และ E-Market ที่ยังเปิดรับข้อเสนอ จัดหมวดด้วย AI จากกรอบธุรกิจจริง</p>
        </div>
      </header>

      <section className="workspace">
        <SearchForm filters={displayFilters} categories={categories} />

        <div className="result-heading">
          <div>
            <p className="eyebrow">ผลการค้นหา</p>
            <h2>{moneyFormatter.format(result.total)} โครงการที่ยังเปิดอยู่</h2>
          </div>
          <div className="sync-meta">
            {result.interpretedByAi ? <span>Gemini ช่วยแปลงคำค้นแล้ว</span> : null}
            <small>ซิงก์ล่าสุด {result.syncedAt ? dateTimeFormatter.format(new Date(result.syncedAt)) : "ยังไม่มีข้อมูล"}</small>
          </div>
        </div>

        {result.warning ? <aside className="warning" role="status">{result.warning}</aside> : null}

        <div className="results">
          {result.items.length
            ? result.items.map((item) => <OpportunityCard item={item} key={item.id} />)
            : <div className="empty"><span>0</span><h2>ยังไม่พบงานที่ตรงเงื่อนไข</h2><p>ลองลดตัวกรองหรือค้นด้วยคำที่กว้างขึ้น</p></div>}
        </div>
      </section>

      <footer>
        <strong>ISAN BID FINDER</strong>
        <p>สถานะงานยึดตามวันปิดรับในประกาศต้นทาง โปรดตรวจสอบเอกสารทางการอีกครั้งก่อนยื่นข้อเสนอ</p>
      </footer>
    </main>
  );
}
