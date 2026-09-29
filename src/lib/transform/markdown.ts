import type { Element, Root as HastRoot } from "hast";
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { remarkRewriteLinks, type LinkContext } from "./links";
import { remarkWikilinks, type WikilinkCollector } from "./wikilinks";

export type MarkdownContext = LinkContext;

export type Heading = { depth: number; text: string; id: string };

export type MarkdownResult = {
  tree: HastRoot;
  /** h1~h4 (문서 순서) */
  headings: Heading[];
  embeds: string[];
  missing: string[];
};

/**
 * 기본 허용 목록에 우리가 만드는 두 가지만 더한다.
 * - 없는 위키링크 표시용 span.wikilink-missing
 * - Excalidraw 자리표시용 div[data-excalidraw]
 * 원본 HTML은 remark-rehype 단계에서 이미 버려지고, 여기서 한 번 더 걸러진다.
 * clobberPrefix를 비우는 이유: 각주의 id는 remark-rehype가 이미 `user-content-`를 붙이므로,
 * sanitize가 또 붙이면 각주 링크와 대상 id가 어긋난다.
 */
const SANITIZE_SCHEMA: SanitizeOptions = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "wikilink-missing"]],
    div: [...(defaultSchema.attributes?.div ?? []), "dataExcalidraw"],
  },
};

function textOf(node: Element | HastRoot): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else if (child.type === "element") out += textOf(child);
  }
  return out;
}

export async function renderMarkdown(body: string, ctx: MarkdownContext): Promise<MarkdownResult> {
  const collector: WikilinkCollector = { embeds: [], missing: [] };
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRewriteLinks, ctx)
    .use(remarkWikilinks, { ...ctx, collector })
    .use(remarkRehype)
    .use(rehypeSanitize, SANITIZE_SCHEMA)
    .use(rehypeSlug);

  const tree = (await processor.run(processor.parse(body))) as HastRoot;

  const headings: Heading[] = [];
  visit(tree, "element", (node) => {
    const match = /^h([1-4])$/.exec(node.tagName);
    const id = node.properties?.id;
    if (match && typeof id === "string") {
      headings.push({ depth: Number(match[1]), text: textOf(node).trim(), id });
    }
  });

  return { tree, headings, embeds: collector.embeds, missing: collector.missing };
}

/** 테스트와 디버깅용. 화면에서는 hast를 React 요소로 바꿔 쓴다. */
export function toHtml(tree: HastRoot): string {
  return unified().use(rehypeStringify).stringify(tree);
}
