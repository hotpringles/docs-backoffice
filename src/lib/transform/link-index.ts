import { isMarkdownPath, isUnderPaths, type TreeEntry } from "../github/tree";
import { basename, nameWithoutMd } from "./paths";

export type LinkIndex = {
  /** 소문자 문서 이름(확장자 없이) → 경로 목록. 표시 대상 문서 폴더 안의 .md만 든다. */
  docs: Map<string, string[]>;
  docPaths: Set<string>;
  /** 소문자 파일 이름 → 경로 목록. 저장소 전체의 .md가 아닌 파일. */
  assets: Map<string, string[]>;
  allPaths: Set<string>;
  dirs: Set<string>;
};

function add(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 위키링크와 상대 링크를 풀기 위해, 트리 전체에서 이름으로 찾을 수 있는 색인을 만든다. */
export function buildLinkIndex(entries: TreeEntry[], docsPaths: string[]): LinkIndex {
  const index: LinkIndex = {
    docs: new Map(),
    docPaths: new Set(),
    assets: new Map(),
    allPaths: new Set(),
    dirs: new Set(),
  };

  for (const { path } of entries) {
    index.allPaths.add(path);
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      index.dirs.add(segments.slice(0, i).join("/"));
    }
    if (isMarkdownPath(path)) {
      if (isUnderPaths(path, docsPaths)) {
        index.docPaths.add(path);
        add(index.docs, nameWithoutMd(path).toLowerCase(), path);
      }
    } else {
      add(index.assets, basename(path).toLowerCase(), path);
    }
  }

  for (const map of [index.docs, index.assets]) {
    for (const list of map.values()) list.sort();
  }
  return index;
}
