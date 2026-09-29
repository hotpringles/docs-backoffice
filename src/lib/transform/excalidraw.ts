import LZString from "lz-string";

export type ExcalidrawScene = {
  type?: string;
  version?: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type ExtractFailure =
  | "no-drawing-block"
  | "too-large"
  | "decompress-failed"
  | "invalid-json"
  | "invalid-scene";

export type ExtractResult =
  | { ok: true; scene: ExcalidrawScene }
  | { ok: false; reason: ExtractFailure };

/** 압축 문자열 상한(문자 수). 악의적으로 큰 파일이 서버 메모리를 쓰지 못하게 막는다. */
const MAX_COMPRESSED_CHARS = 10_000_000;

const FENCE_RE = /```(compressed-json|json)[ \t]*\r?\n([\s\S]*?)\r?\n```/;

function isScene(value: unknown): value is ExcalidrawScene {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { elements?: unknown }).elements)
  );
}

/** Obsidian Excalidraw 플러그인 문서(`.excalidraw.md`)에서 그림 장면 JSON을 꺼낸다. */
export function extractExcalidraw(raw: string): ExtractResult {
  const start = raw.indexOf("## Drawing");
  if (start === -1) return { ok: false, reason: "no-drawing-block" };

  const match = FENCE_RE.exec(raw.slice(start));
  if (!match) return { ok: false, reason: "no-drawing-block" };

  const [, kind, body] = match;
  let json: string | null;
  if (kind === "compressed-json") {
    // 플러그인은 압축 문자열을 여러 줄로 나눠 저장하므로 공백과 개행을 모두 지운다.
    const compressed = body.replace(/\s+/g, "");
    if (compressed.length > MAX_COMPRESSED_CHARS) return { ok: false, reason: "too-large" };
    try {
      json = LZString.decompressFromBase64(compressed);
    } catch {
      json = null;
    }
    if (!json) return { ok: false, reason: "decompress-failed" };
  } else {
    json = body;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  return isScene(parsed) ? { ok: true, scene: parsed } : { ok: false, reason: "invalid-scene" };
}
