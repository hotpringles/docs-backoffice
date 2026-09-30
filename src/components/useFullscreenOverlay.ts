"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 그림을 화면 전체에 크게 보는 덮개의 상태.
 * iPhone Safari는 임의의 요소를 브라우저 전체화면(Fullscreen API)으로 만들 수 없어서, 화면을 덮는 고정 덮개(CSS)를 기본으로 쓴다.
 * Fullscreen API가 되는 브라우저(PC, iPad)에서는 같은 덮개를 브라우저 전체화면으로도 켜고, Esc로 나가면 덮개도 닫는다.
 * 덮개가 열려 있는 동안에는 뒤의 페이지가 스크롤되지 않게 한다.
 */
export function useFullscreenOverlay() {
  const [full, setFull] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!full) return;
    const overlay = overlayRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlay?.requestFullscreen?.().catch(() => undefined); // 안 되는 브라우저는 덮개만 쓴다.

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFull(false); // 브라우저 전체화면에서 Esc로 나온 경우
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [full]);

  return { full, overlayRef, open: () => setFull(true), close: () => setFull(false) };
}
