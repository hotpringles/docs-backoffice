import type { PhrasingContent } from "mdast";

/** 풀 수 없는 링크나 위키링크를 표시하는 span.wikilink-missing 노드 */
export function missingNode(children: PhrasingContent[]): PhrasingContent {
  return {
    type: "wikilinkMissing",
    data: { hName: "span", hProperties: { className: ["wikilink-missing"], title: "없는 문서" } },
    children,
  } as unknown as PhrasingContent;
}
