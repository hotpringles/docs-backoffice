"use client";

import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ExcalidrawScene } from "@/lib/transform/excalidraw";

// Excalidraw는 브라우저 전용이라 서버에서는 그리지 않고, 필요할 때 동적으로 불러온다.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <p className="drawing-loading">그림을 불러오는 중…</p>,
});

type Props = {
  scene: ExcalidrawScene;
  height?: string;
  /** 이 값이 바뀌면(예: 전체화면으로 바뀌어 크기가 달라지면) 그림을 새 크기에 맞춰 다시 보여 준다. */
  refitOn?: unknown;
};

const fitToViewport = (api: ExcalidrawImperativeAPI) =>
  api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.95 });

/** 읽기 전용 Excalidraw 뷰어. 컨테이너에 높이가 있어야 그려진다. */
export function ExcalidrawView({ scene, height = "70vh", refitOn }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const background =
    typeof scene.appState?.viewBackgroundColor === "string" ? scene.appState.viewBackgroundColor : "#ffffff";

  // 큰 그림도 처음에는 화면 안에 다 들어오도록 맞춘다. 이후 확대·이동은 사용자가 한다.
  // API 콜백이 불리는 시점에는 아직 마운트 전이라, 상태에 담아 둔 뒤 다음 프레임에 호출한다.
  useEffect(() => {
    if (!api) return;
    const frame = requestAnimationFrame(() => fitToViewport(api));
    return () => cancelAnimationFrame(frame);
  }, [api]);

  // 전체화면으로 들어가거나 나오면 크기가 바뀌므로, 레이아웃이 자리 잡은 뒤에 새 크기에 맞춘다.
  useEffect(() => {
    if (!api || refitOn === undefined) return;
    const timer = setTimeout(() => fitToViewport(api), 150);
    return () => clearTimeout(timer);
  }, [api, refitOn]);

  return (
    <div className="drawing" style={{ height }}>
      <Excalidraw
        viewModeEnabled
        zenModeEnabled
        excalidrawAPI={setApi}
        initialData={{
          // 플러그인이 저장한 appState 전체를 넘기면 collaborators 등이 Map이 아니라서 깨지므로 배경색만 쓴다.
          elements: scene.elements as never,
          appState: { viewBackgroundColor: background },
          files: (scene.files ?? {}) as never,
        }}
      />
    </div>
  );
}
