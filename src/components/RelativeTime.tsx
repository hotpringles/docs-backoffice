"use client";

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/relative-time";

/**
 * "N분 전"은 페이지가 캐시된 시점이 아니라 보는 시점 기준이어야 하므로 브라우저에서 계산한다.
 * 서버와 브라우저의 첫 렌더링 결과가 같도록, 처음에는 UTC 날짜만 보여준다.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 10));

  useEffect(() => {
    const update = () => setText(formatRelative(iso));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time dateTime={iso} title={iso}>
      {text}
    </time>
  );
}
