"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-state">
      <h1>เปิดหน้าค้นหาไม่สำเร็จ</h1>
      <p>ข้อมูลเดิมยังปลอดภัย กรุณาลองโหลดใหม่อีกครั้ง</p>
      <button onClick={reset}>ลองใหม่</button>
    </div>
  );
}
