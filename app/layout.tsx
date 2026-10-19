import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Isan Bid Finder — ค้นหางานประมูลภาครัฐ",
  description: "ค้นหา E-Bidding และ E-Market ที่ยังเปิดอยู่ในภาคอีสาน",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={notoSansThai.variable}>{children}</body>
    </html>
  );
}
