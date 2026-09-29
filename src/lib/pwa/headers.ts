export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * 서비스 워커(`/sw.js`)에 붙이는 응답 헤더.
 * - 캐시를 막아서 새 버전이 바로 반영되게 한다(오래된 서비스 워커가 남으면 알림이 옛 동작으로 뜬다).
 * - 자기 도메인의 스크립트만 실행하도록 CSP를 건다.
 */
export function serviceWorkerHeaders(): HeaderRule[] {
  return [
    {
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
      ],
    },
  ];
}
