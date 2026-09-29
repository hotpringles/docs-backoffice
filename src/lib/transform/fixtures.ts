import type { TreeEntry } from "../github/tree";
import { buildLinkIndex } from "./link-index";
import { renderMarkdown, toHtml, type MarkdownContext } from "./markdown";

/** Markdown 변환 테스트가 함께 쓰는 가짜 저장소. 표시 대상 문서 폴더는 `d`다. */
export const repo = { owner: "org", name: "repo", branch: "develop" };

export const entries: TreeEntry[] = [
  "d/index.md",
  "d/Note A.md",
  "d/sub/Note B.md",
  "d/other/Note B.md",
  "d/diagram.excalidraw.md",
  "d/img/pic.png",
  "d/guide.pdf",
  "outside/secret.md",
  "src/App.tsx",
].map((path) => ({ path, sha: `sha-${path}` }));

export function ctx(currentPath = "d/index.md"): MarkdownContext {
  return { currentPath, index: buildLinkIndex(entries, ["d"]), repo };
}

export async function html(md: string, currentPath?: string): Promise<string> {
  return toHtml((await renderMarkdown(md, ctx(currentPath))).tree);
}
