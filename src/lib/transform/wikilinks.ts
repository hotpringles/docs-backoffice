import GithubSlugger from "github-slugger";
import type { Image, Link, Paragraph, Parent, PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import { docUrl, isDrawingPath, isMarkdownPath } from "../github/tree";
import type { LinkIndex } from "./link-index";
import type { LinkContext } from "./links";
import { missingNode } from "./nodes";
import { dirname } from "./paths";
import { blobUrl, rawUrl } from "./repo-urls";

export type WikilinkCollector = {
  /** 문서 안에 그대로 그려야 하는 Excalidraw 그림의 저장소 경로 */
  embeds: string[];
  /** 대상을 찾지 못한 위키링크 */
  missing: string[];
};

export type WikilinkOptions = LinkContext & { collector: WikilinkCollector };

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
const WHOLE_EMBED_RE = /^!\[\[([^[\]\r\n]+?)\]\]$/;

type Resolved =
  | { kind: "doc" | "drawing" | "asset"; path: string }
  | { kind: "self" }
  | { kind: "missing" };

function parseInner(inner: string): { label: string; target: string; heading: string; alias: string } {
  const pipe = inner.indexOf("|");
  const left = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
  const hash = left.indexOf("#");
  const target = (hash === -1 ? left : left.slice(0, hash)).trim();
  let heading = hash === -1 ? "" : left.slice(hash + 1).trim();
  if (heading.startsWith("^")) heading = ""; // 블록 참조는 문서 연결까지만 지원한다.
  const label = alias || (heading ? `${target} › ${heading}` : target);
  return { label, target, heading, alias };
}

/** 같은 폴더의 후보를 먼저, 없으면 경로순 첫 번째를 고른다. */
function pickNearest(candidates: string[], currentPath: string): string | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort();
  const here = dirname(currentPath);
  return sorted.find((path) => dirname(path) === here) ?? sorted[0];
}

export function resolveWikilink(target: string, currentPath: string, index: LinkIndex): Resolved {
  const cleaned = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned) return { kind: "self" };

  const docKey = cleaned.replace(/\.md$/i, "").toLowerCase();
  const docCandidates = docKey.includes("/")
    ? [...index.docPaths].filter((path) => {
        const normalized = path.replace(/\.md$/i, "").toLowerCase();
        return normalized === docKey || normalized.endsWith(`/${docKey}`);
      })
    : (index.docs.get(docKey) ?? []);
  const doc = pickNearest(docCandidates, currentPath);
  if (doc) return { kind: isDrawingPath(doc) ? "drawing" : "doc", path: doc };

  const fileKey = cleaned.toLowerCase();
  const assetCandidates = fileKey.includes("/")
    ? [...index.allPaths].filter((path) => {
        if (isMarkdownPath(path)) return false;
        const normalized = path.toLowerCase();
        return normalized === fileKey || normalized.endsWith(`/${fileKey}`);
      })
    : (index.assets.get(fileKey) ?? []);
  const asset = pickNearest(assetCandidates, currentPath);
  return asset ? { kind: "asset", path: asset } : { kind: "missing" };
}

function text(value: string): Text {
  return { type: "text", value };
}

function link(url: string, label: string): Link {
  return { type: "link", url, title: null, children: [text(label)] };
}

function missing(label: string): PhrasingContent {
  return missingNode([text(label)]);
}

function embedNode(path: string): Paragraph {
  return {
    type: "excalidrawEmbed",
    data: { hName: "div", hProperties: { dataExcalidraw: path } },
    children: [],
  } as unknown as Paragraph;
}

function anchor(heading: string): string {
  return heading ? `#${new GithubSlugger().slug(heading)}` : "";
}

function convert(isEmbed: boolean, inner: string, options: WikilinkOptions): PhrasingContent[] {
  const { label, target, heading, alias } = parseInner(inner);
  const resolved = resolveWikilink(target, options.currentPath, options.index);

  switch (resolved.kind) {
    case "self":
      return heading ? [link(anchor(heading), label)] : [missing(label || inner)];
    case "doc":
    case "drawing":
      return [link(docUrl(resolved.path) + anchor(heading), label)];
    case "asset": {
      if (isEmbed && IMAGE_EXT_RE.test(resolved.path)) {
        const alt = alias && !/^\d+(x\d+)?$/.test(alias) ? alias : target;
        const image: Image = { type: "image", url: rawUrl(options.repo, resolved.path), alt, title: null };
        return [image];
      }
      return [link(blobUrl(options.repo, resolved.path), label)];
    }
    case "missing":
      options.collector.missing.push(target || inner);
      return [missing(label || inner)];
  }
}

function splitText(value: string, options: WikilinkOptions): PhrasingContent[] | null {
  const pattern = /(!?)\[\[([^[\]\r\n]+?)\]\]/g;
  const out: PhrasingContent[] = [];
  let last = 0;
  let matched = false;
  for (const match of value.matchAll(pattern)) {
    matched = true;
    const start = match.index ?? 0;
    if (start > last) out.push(text(value.slice(last, start)));
    out.push(...convert(match[1] === "!", match[2], options));
    last = start + match[0].length;
  }
  if (!matched) return null;
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
}

/** Obsidian 위키링크(`[[ ]]`, `![[ ]]`)를 일반 링크, 이미지, 그림 자리표시로 바꾼다. */
export function remarkWikilinks(options: WikilinkOptions) {
  return (tree: Root): void => {
    // 1) 한 줄이 `![[그림.excalidraw]]` 하나뿐이면 문단을 그림 블록으로 바꾼다.
    visit(tree, "paragraph", (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (node.children.length !== 1 || node.children[0].type !== "text") return;
      const match = WHOLE_EMBED_RE.exec(node.children[0].value.trim());
      if (!match) return;
      const { target } = parseInner(match[1]);
      const resolved = resolveWikilink(target, options.currentPath, options.index);
      if (resolved.kind !== "drawing") return;
      options.collector.embeds.push(resolved.path);
      (parent as Parent).children.splice(index, 1, embedNode(resolved.path));
      return [SKIP, index + 1];
    });

    // 2) 나머지 텍스트 속 위키링크. 코드와 기존 링크 안은 건드리지 않는다.
    visit(tree, "text", (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (parent.type === "link" || parent.type === "linkReference") return;
      const replaced = splitText(node.value, options);
      if (!replaced) return;
      (parent as Parent).children.splice(index, 1, ...replaced);
      return [SKIP, index + replaced.length];
    });
  };
}
