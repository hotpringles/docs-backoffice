import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";
import "./globals.css";

// 글꼴: Obsidian의 Serenity 테마처럼 iA Writer 글꼴 세 가지를 쓴다(SIL Open Font License 1.1, ./fonts/LICENSE-iA-Writer.md).
// Quattro는 화면 전체와 제목, Duo는 문서 본문, Mono는 코드에 쓴다. 우리 서버에서 직접 내려준다(외부 CDN을 쓰지 않는다).
const quattro = localFont({
  src: [
    { path: "./fonts/iAWriterQuattroS-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/iAWriterQuattroS-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/iAWriterQuattroS-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/iAWriterQuattroS-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-quattro",
  display: "swap",
});
const duo = localFont({
  src: [
    { path: "./fonts/iAWriterDuoS-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/iAWriterDuoS-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/iAWriterDuoS-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/iAWriterDuoS-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-duo",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/iAWriterMonoS-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/iAWriterMonoS-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});
// iA Writer 글꼴에는 한글이 없다. iA Writer가 바탕으로 삼은 IBM Plex와 같은 계열인 IBM Plex Sans KR로 한글을 채운다.
// 한글 글꼴은 조각(unicode-range)으로 나뉘어 있어서 쓰는 글자의 조각만 내려받는다.
const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "700"],
  variable: "--font-plex-kr",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Docs Backoffice", template: "%s · Docs Backoffice" },
  description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
  // 홈 화면에 추가했을 때의 이름과 아이콘. manifest 링크는 app/manifest.ts에서 자동으로 붙는다.
  appleWebApp: { capable: true, title: "문서", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fcfcfa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${quattro.variable} ${duo.variable} ${mono.variable} ${plexKr.variable}`}>
      <body>
        <header className="site-header">
          <div className="site-nav">
            <Link href="/" className="site-title">
              Docs Backoffice
            </Link>
            <nav aria-label="주요 메뉴" className="site-links">
              <Link href="/">문서</Link>
              <Link href="/calendar">달력</Link>
              <Link href="/meetups">모임</Link>
            </nav>
          </div>
          <NotificationBell />
        </header>
        {children}
      </body>
    </html>
  );
}
