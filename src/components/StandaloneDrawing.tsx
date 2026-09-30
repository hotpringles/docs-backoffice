"use client";

import type { ExcalidrawScene } from "@/lib/transform/excalidraw";
import { ExcalidrawView } from "./ExcalidrawView";
import { useFullscreenOverlay } from "./useFullscreenOverlay";

type Props = { scene: ExcalidrawScene; title: string };

/** 그림 단독 화면의 그림. 처음부터 조작할 수 있고, "전체화면"으로 화면 전체에 크게 볼 수 있다. */
export function StandaloneDrawing({ scene, title }: Props) {
  const { full, overlayRef, open, close } = useFullscreenOverlay();

  return (
    <figure className="drawing-figure">
      <div ref={overlayRef} className={full ? "drawing-overlay" : undefined}>
        {full && (
          <div className="drawing-overlay-bar">
            <strong>{title}</strong>
            <button type="button" onClick={close}>
              닫기
            </button>
          </div>
        )}
        <div className="drawing-frame">
          <ExcalidrawView scene={scene} height={full ? "100%" : "80vh"} refitOn={full} />
        </div>
      </div>
      <figcaption>
        <button type="button" onClick={open}>
          전체화면
        </button>
      </figcaption>
    </figure>
  );
}
