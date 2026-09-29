import LZString from "lz-string";
import { describe, expect, it } from "vitest";
import { extractExcalidraw } from "./excalidraw";

const scene = {
  type: "excalidraw",
  version: 2,
  source: "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.27.3",
  elements: [
    { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
    { id: "b", type: "text", x: 10, y: 10, text: "프론트엔드 흐름" },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

/** 플러그인처럼 압축 문자열을 256자씩 여러 줄로 나눠 넣은 문서를 만든다. */
function pluginDoc(newline = "\n"): string {
  const compressed = LZString.compressToBase64(JSON.stringify(scene));
  const lines = compressed.match(/.{1,256}/g)!.join(newline);
  return [
    "---",
    "",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "",
    "---",
    "==⚠  Switch to EXCALIDRAW VIEW ⚠==",
    "",
    "",
    "# Excalidraw Data",
    "",
    "## Text Elements",
    "프론트엔드 흐름 ^abc",
    "",
    "%%",
    "## Drawing",
    "```compressed-json",
    lines,
    "```",
    "%%",
  ].join(newline);
}

describe("extractExcalidraw", () => {
  it("여러 줄로 나뉜 compressed-json을 풀어 장면을 돌려준다", () => {
    const result = extractExcalidraw(pluginDoc());
    expect(result).toEqual({ ok: true, scene });
  });

  it("CRLF 줄바꿈이어도 풀린다", () => {
    expect(extractExcalidraw(pluginDoc("\r\n"))).toEqual({ ok: true, scene });
  });

  it("평문 json 블록도 읽는다", () => {
    const raw = `## Drawing\n\`\`\`json\n${JSON.stringify(scene)}\n\`\`\`\n`;
    expect(extractExcalidraw(raw)).toEqual({ ok: true, scene });
  });

  it("Drawing 블록이 없으면 no-drawing-block", () => {
    expect(extractExcalidraw("# 그냥 문서")).toEqual({ ok: false, reason: "no-drawing-block" });
    expect(extractExcalidraw("## Drawing\n내용만 있음")).toEqual({
      ok: false,
      reason: "no-drawing-block",
    });
  });

  it("압축 데이터가 깨져 있으면 decompress-failed", () => {
    const raw = "## Drawing\n```compressed-json\n!!!not-base64!!!\n```\n";
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "decompress-failed" });
  });

  it("json이 깨져 있으면 invalid-json", () => {
    const raw = "## Drawing\n```json\n{ broken\n```\n";
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("장면 모양이 아니면 invalid-scene", () => {
    const raw = "## Drawing\n```json\n{\"hello\": 1}\n```\n";
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "invalid-scene" });
    expect(extractExcalidraw("## Drawing\n```json\n[1,2]\n```\n")).toEqual({
      ok: false,
      reason: "invalid-scene",
    });
  });

  it("압축 문자열이 너무 크면 풀지 않고 too-large", () => {
    const raw = `## Drawing\n\`\`\`compressed-json\n${"A".repeat(10_000_001)}\n\`\`\`\n`;
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "too-large" });
  });

  it("빈 문서도 예외 없이 실패로 돌려준다", () => {
    expect(extractExcalidraw("")).toEqual({ ok: false, reason: "no-drawing-block" });
  });
});
