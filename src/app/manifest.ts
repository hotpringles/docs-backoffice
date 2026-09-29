import type { MetadataRoute } from "next";

/** 홈 화면에 설치하는 웹 앱 정보. iPhone에서 푸시 알림을 받으려면 이 앱을 홈 화면에 추가해야 한다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "문서 백오피스",
    short_name: "문서",
    description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone", // iOS의 웹 푸시는 standalone(또는 fullscreen)일 때만 동작한다.
    background_color: "#ffffff",
    theme_color: "#1f2328",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
