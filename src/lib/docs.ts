import "server-only";
import { cache } from "react";
import { loadConfig } from "@/lib/config";
import { getBlobText, getTree } from "@/lib/github";
import { findDocEntry, isDrawingPath, type TreeEntry } from "@/lib/github/tree";
import { parseDocument, type ParsedDocument } from "@/lib/transform";
import { extractExcalidraw, type ExtractResult } from "@/lib/transform/excalidraw";
import { buildLinkIndex } from "@/lib/transform/link-index";
import { displayName } from "@/lib/transform/paths";
import { blobUrl } from "@/lib/transform/repo-urls";

export type DrawingResult = ExtractResult | { ok: false; reason: "not-found" };

export type DocPage =
  | {
      kind: "markdown";
      path: string;
      title: string;
      stale: boolean;
      sourceUrl: string;
      doc: ParsedDocument;
      /** 문서 안에 임베드된 그림(저장소 경로 → 결과) */
      drawings: Record<string, DrawingResult>;
    }
  | {
      kind: "drawing";
      path: string;
      title: string;
      stale: boolean;
      sourceUrl: string;
      result: DrawingResult;
    };

export async function loadDrawing(
  entries: TreeEntry[],
  docsPaths: string[],
  path: string,
): Promise<DrawingResult> {
  const entry = findDocEntry(entries, docsPaths, path);
  if (!entry || !isDrawingPath(path)) return { ok: false, reason: "not-found" };
  return extractExcalidraw(await getBlobText(entry.sha));
}

/**
 * 문서 상세 화면에 필요한 모든 데이터를 불러온다. 문서가 없으면 null.
 * 같은 요청 안에서 generateMetadata와 페이지가 함께 불러도 한 번만 실행되도록 cache로 감쌌다.
 */
export const loadDocPage = cache(async (path: string): Promise<DocPage | null> => {
  const config = loadConfig();
  const { value: entries, stale } = await getTree();
  const entry = findDocEntry(entries, config.docsPaths, path);
  if (!entry) return null;

  const repo = { ...config.repo, branch: config.branch };
  const sourceUrl = blobUrl(repo, path);
  const raw = await getBlobText(entry.sha);

  if (isDrawingPath(path)) {
    return {
      kind: "drawing",
      path,
      title: displayName(path),
      stale,
      sourceUrl,
      result: extractExcalidraw(raw),
    };
  }

  const doc = await parseDocument(raw, {
    currentPath: path,
    index: buildLinkIndex(entries, config.docsPaths),
    repo,
  });
  const embedPaths = [...new Set(doc.embeds)];
  const drawings = Object.fromEntries(
    await Promise.all(
      embedPaths.map(async (embedPath) => [
        embedPath,
        await loadDrawing(entries, config.docsPaths, embedPath),
      ]),
    ),
  );
  return { kind: "markdown", path, title: doc.title, stale, sourceUrl, doc, drawings };
});
