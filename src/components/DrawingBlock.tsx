import type { DrawingResult } from "@/lib/docs";
import { ExcalidrawView } from "./ExcalidrawView";
import { InlineDrawing } from "./InlineDrawing";

const REASONS: Record<string, string> = {
  "not-found": "그림 파일을 찾지 못했어요",
  "fetch-failed": "GitHub에서 그림을 불러오지 못했어요",
  "no-drawing-block": "그림 데이터가 없어요",
  "too-large": "그림 데이터가 너무 커요",
  "decompress-failed": "그림 데이터를 풀지 못했어요",
  "invalid-json": "그림 데이터가 깨져 있어요",
  "invalid-scene": "그림 데이터 모양이 올바르지 않아요",
};

type Props = {
  path: string;
  result: DrawingResult;
  sourceUrl: string;
  /** 문서 안에 끼워 넣을 때는 true(작은 높이와 "크게 보기" 링크), 단독 화면에서는 false */
  inline?: boolean;
};

/** 그림 하나를 그리거나, 그릴 수 없으면 그 자리에만 이유와 원본 링크를 보여준다. */
export function DrawingBlock({ path, result, sourceUrl, inline = false }: Props) {
  if (!result.ok) {
    return (
      <p className="drawing-error" role="alert">
        그림을 표시할 수 없어요 ({REASONS[result.reason] ?? result.reason}).{" "}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          GitHub에서 원본 보기
        </a>
      </p>
    );
  }
  // 문서 글 사이의 그림은 잠가 두고(스크롤 통과), 단독 화면의 그림은 처음부터 조작할 수 있다.
  if (inline) return <InlineDrawing scene={result.scene} path={path} />;
  return (
    <figure className="drawing-figure">
      <ExcalidrawView scene={result.scene} height="80vh" />
    </figure>
  );
}
