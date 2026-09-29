import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Docs Backoffice", template: "%s · Docs Backoffice" },
  description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <Link href="/" className="site-title">
            Docs Backoffice
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
