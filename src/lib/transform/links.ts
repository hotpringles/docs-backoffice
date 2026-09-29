import type { Parent, PhrasingContent, Root } from "mdast";
import { visit } from "unist-util-visit";
import { docUrl } from "../github/tree";
import type { LinkIndex } from "./link-index";
import { missingNode } from "./nodes";
import { dirname, resolveRepoPath } from "./paths";
import { blobUrl, rawUrl, treeUrl, type RepoRef } from "./repo-urls";

export type LinkContext = {
  /** 지금 렌더링하는 문서의 저장소 경로 */
  currentPath: string;
  index: LinkIndex;
  repo: RepoRef;
};

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * 문서 안의 상대 주소를 화면에서 열 수 있는 주소로 바꾼다.
 * - 이미지 → 원본 파일 주소
 * - 표시 대상 문서(.md) → 사이트 안의 문서 주소
 * - 그 밖의 파일과 폴더 → GitHub 화면 주소
 * 절대 주소와 `#앵커`는 그대로 두고, 저장소에서 찾지 못한 상대 주소도 그대로 돌려준다.
 */
export function rewriteUrl(url: string, isImage: boolean, ctx: LinkContext): string {
  if (!url || url.startsWith("#") || url.startsWith("//") || SCHEME_RE.test(url)) return url;

  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt + 1);
  let pathPart = (hashAt === -1 ? url : url.slice(0, hashAt)).split("?")[0];
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch {
    // 잘못된 % 인코딩은 원문 그대로 쓴다.
  }

  const resolved = resolveRepoPath(dirname(ctx.currentPath), pathPart);
  if (resolved === null) return url;

  const { index, repo } = ctx;
  if (isImage) return index.allPaths.has(resolved) ? rawUrl(repo, resolved) : url;
  if (index.docPaths.has(resolved)) return docUrl(resolved) + (hash ? `#${hash}` : "");
  if (index.allPaths.has(resolved)) return blobUrl(repo, resolved);
  if (index.dirs.has(resolved)) return treeUrl(repo, resolved);
  return url;
}

/** 다시 쓴 뒤에도 남아 있는 상대 주소: 우리 사이트의 없는 경로를 가리키게 되므로 링크로 두면 안 된다. */
function isUnresolved(url: string): boolean {
  if (!url || url.startsWith("#") || url.startsWith("//") || SCHEME_RE.test(url)) return false;
  return !url.startsWith("/docs/");
}

export function remarkRewriteLinks(ctx: LinkContext) {
  return (tree: Root): void => {
    visit(tree, (node, index, parent) => {
      if (node.type === "definition") {
        node.url = rewriteUrl(node.url, false, ctx);
        return;
      }
      if (node.type !== "link" && node.type !== "image") return;

      const url = rewriteUrl(node.url, node.type === "image", ctx);
      if (isUnresolved(url) && parent && index !== undefined) {
        const children: PhrasingContent[] =
          node.type === "link" ? node.children : [{ type: "text", value: node.alt || node.url }];
        (parent as Parent).children.splice(index, 1, missingNode(children));
        return index; // 새로 넣은 노드의 안쪽(중첩된 이미지 등)도 계속 처리한다.
      }
      node.url = url;
    });
  };
}
