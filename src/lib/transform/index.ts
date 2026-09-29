import type { Root as HastRoot } from "hast";
import { splitFrontmatter, type Frontmatter } from "./frontmatter";
import { renderMarkdown, type Heading, type MarkdownContext } from "./markdown";
import { displayName } from "./paths";

export type ParsedDocument = {
  title: string;
  /** 본문에 h1이 있으면 true. 화면에서 제목을 중복해서 그리지 않는 데 쓴다. */
  hasH1: boolean;
  frontmatter: Frontmatter;
  /** frontmatter를 읽지 못했을 때의 이유 */
  frontmatterError?: string;
  tree: HastRoot;
  /** h2~h4 */
  toc: Heading[];
  /** 문서 안에 그려야 하는 Excalidraw 그림의 저장소 경로 */
  embeds: string[];
  /** 대상을 찾지 못한 위키링크 */
  missing: string[];
};

/** 일반 Markdown 문서 하나를 화면용 데이터로 바꾼다. (`.excalidraw.md`는 이 함수를 쓰지 않는다.) */
export async function parseDocument(raw: string, ctx: MarkdownContext): Promise<ParsedDocument> {
  const { frontmatter, body, error } = splitFrontmatter(raw);
  const { tree, headings, embeds, missing } = await renderMarkdown(body, ctx);
  const h1 = headings.find((heading) => heading.depth === 1);

  return {
    title: frontmatter.title ?? (h1?.text || displayName(ctx.currentPath)),
    hasH1: Boolean(h1),
    frontmatter,
    frontmatterError: error,
    tree,
    toc: headings.filter((heading) => heading.depth >= 2),
    embeds,
    missing,
  };
}

export { displayName as titleFromPath } from "./paths";
