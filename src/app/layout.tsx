import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { themeInitScript } from "@/lib/theme";
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

// 브라우저 상단 색(theme-color)은 여기서 정하지 않는다: 고른 테마에 따라 달라서 첫 화면 전에 도는 스크립트(themeInitScript)가
// 태그를 하나 만들어 관리한다. Next.js가 만들게 두면, 문서 화면처럼 제목을 나중에 계산하는 화면에서 라이트 값의 태그가 뒤늦게
// 하나 더 붙어서 어두운 테마의 상단 색을 덮어쓴다.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme는 첫 화면 전에 스크립트가 붙이므로 서버가 만든 HTML과 달라도 정상이다(suppressHydrationWarning).
    <html lang="ko" className={`${quattro.variable} ${duo.variable} ${mono.variable} ${plexKr.variable}`} suppressHydrationWarning>
      <head>
        {/* 첫 화면이 그려지기 전에 저장된 테마를 적용해서 어두운 테마를 쓰는 사람에게 흰 화면이 번쩍이지 않게 한다. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
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
          <div className="site-tools">
            <ThemeSwitch />
            <NotificationBell />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
