import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Docs Backoffice", template: "%s · Docs Backoffice" },
  description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
  // 홈 화면에 추가했을 때의 이름과 아이콘. manifest 링크는 app/manifest.ts에서 자동으로 붙는다.
  appleWebApp: { capable: true, title: "문서", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f2328" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="site-nav">
            <Link href="/" className="site-title">
              Docs Backoffice
            </Link>
            <nav aria-label="주요 메뉴" className="site-links">
              <Link href="/">문서</Link>
              <Link href="/calendar">달력</Link>
            </nav>
          </div>
          <NotificationBell />
        </header>
        {children}
      </body>
    </html>
  );
}
