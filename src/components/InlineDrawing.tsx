"use client";

import { useState } from "react";
import { docUrl } from "@/lib/github/tree";
import type { ExcalidrawScene } from "@/lib/transform/excalidraw";
import { ExcalidrawView } from "./ExcalidrawView";

type Props = { scene: ExcalidrawScene; path: string };

/**
 * 문서 글 사이에 끼워 넣는 그림.
 * Excalidraw 캔버스는 터치와 휠을 모두 가져가서, 잠그지 않으면 폰에서 그림 위를 스와이프할 때
 * 페이지가 스크롤되지 않는다. 그래서 처음에는 잠가 두고(페이지 스크롤로 통과),
 * "그림 조작하기"를 눌렀을 때만 확대·이동할 수 있게 한다.
 */
export function InlineDrawing({ scene, path }: Props) {
  const [active, setActive] = useState(false);

  return (
    <figure className="drawing-figure">
      <div className={active ? "drawing-frame" : "drawing-frame drawing-locked"}>
        <ExcalidrawView scene={scene} height="60vh" />
      </div>
      <figcaption>
        <button type="button" aria-pressed={active} onClick={() => setActive((value) => !value)}>
          {active ? "그림 조작 끝내기" : "그림 조작하기"}
        </button>{" "}
        <a href={docUrl(path)}>크게 보기</a>
      </figcaption>
    </figure>
  );
}
