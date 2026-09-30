"use client";

import { useState } from "react";
import { docUrl } from "@/lib/github/tree";
import type { ExcalidrawScene } from "@/lib/transform/excalidraw";
import { displayName } from "@/lib/transform/paths";
import { ExcalidrawView } from "./ExcalidrawView";
import { useFullscreenOverlay } from "./useFullscreenOverlay";

type Props = { scene: ExcalidrawScene; path: string };

/**
 * 문서 글 사이에 끼워 넣는 그림.
 * Excalidraw 캔버스는 터치와 휠을 모두 가져가서, 잠그지 않으면 폰에서 그림 위를 스와이프할 때
 * 페이지가 스크롤되지 않는다. 그래서 처음에는 잠가 두고(페이지 스크롤로 통과),
 * "그림 조작하기"를 눌렀을 때만 확대·이동할 수 있게 한다. "전체화면"에서는 페이지 스크롤이 필요 없으니 처음부터 조작할 수 있다.
 */
export function InlineDrawing({ scene, path }: Props) {
  const [active, setActive] = useState(false);
  const { full, overlayRef, open, close } = useFullscreenOverlay();

  return (
    <figure className="drawing-figure">
      {/* 같은 요소의 클래스만 바꿔서 전체화면으로 만들기 때문에, 그림이 다시 그려지지 않고 확대·이동한 상태가 유지된다. */}
      <div ref={overlayRef} className={full ? "drawing-overlay" : undefined}>
        {full && (
          <div className="drawing-overlay-bar">
            <strong>{displayName(path)}</strong>
            <button type="button" onClick={close}>
              닫기
            </button>
          </div>
        )}
        <div className={active || full ? "drawing-frame" : "drawing-frame drawing-locked"}>
          <ExcalidrawView scene={scene} height={full ? "100%" : "60vh"} refitOn={full} />
        </div>
      </div>
      <figcaption>
        <button type="button" aria-pressed={active} onClick={() => setActive((value) => !value)}>
          {active ? "그림 조작 끝내기" : "그림 조작하기"}
        </button>{" "}
        <button type="button" onClick={open}>
          전체화면
        </button>{" "}
        <a href={docUrl(path)}>크게 보기</a>
      </figcaption>
    </figure>
  );
}
