export type TreeEntry = { path: string; sha: string; size?: number };

export type TreeNode =
  | { type: "folder"; name: string; path: string; children: TreeNode[] }
  | {
      type: "file";
      name: string;
      path: string;
      kind: "doc" | "drawing";
      url: string;
    };

export type TreeGroup = { root: string; label: string; nodes: TreeNode[] };

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export function isDrawingPath(path: string): boolean {
  return path.toLowerCase().endsWith(".excalidraw.md");
}

/** docsPaths가 비어 있으면 저장소 전체. 폴더 경계까지 맞아야 한다(plan은 plan-old와 다르다). */
export function isUnderPaths(path: string, docsPaths: string[]): boolean {
  if (docsPaths.length === 0) return true;
  return docsPaths.some((root) => path.startsWith(`${root}/`));
}

/** 가장 길게 일치하는 문서 폴더. docsPaths가 비어 있으면 "" (저장소 루트). */
function rootOf(path: string, docsPaths: string[]): string | null {
  if (docsPaths.length === 0) return "";
  let best: string | null = null;
  for (const root of docsPaths) {
    if (path.startsWith(`${root}/`) && (best === null || root.length > best.length)) {
      best = root;
    }
  }
  return best;
}

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 문서 폴더 아래의 .md 파일만 남기고 경로순으로 정렬한다. */
export function filterDocTree(entries: TreeEntry[], docsPaths: string[]): TreeEntry[] {
  return entries
    .filter((entry) => isMarkdownPath(entry.path) && isUnderPaths(entry.path, docsPaths))
    .sort((a, b) => comparePath(a.path, b.path));
}

/**
 * 화면에서 열 수 있는 문서인지 확인하고 트리 항목을 돌려준다.
 * 트리에 있고, .md이고, 표시 대상 폴더 안에 있는 경로만 통과한다(임의 경로를 가져오지 않는다).
 */
export function findDocEntry(
  entries: TreeEntry[],
  docsPaths: string[],
  path: string,
): TreeEntry | undefined {
  if (!isMarkdownPath(path) || !isUnderPaths(path, docsPaths)) return undefined;
  return entries.find((entry) => entry.path === path);
}

export function encodeDocPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function docUrl(path: string): string {
  return `/docs/${encodeDocPath(path)}`;
}

/** URL 조각을 저장소 경로로 바꾼다. 비어 있거나 "."/".."/역슬래시/NUL이 있으면 null. */
export function pathFromSegments(segments: string[]): string | null {
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0") ||
      segment.includes("/")
    ) {
      return null;
    }
  }
  return segments.join("/");
}

type MutableFolder = { folders: Map<string, MutableFolder>; files: TreeEntry[] };

function toNodes(folder: MutableFolder, prefix: string): TreeNode[] {
  const folders: TreeNode[] = [...folder.folders.entries()]
    .sort(([a], [b]) => comparePath(a, b))
    .map(([name, child]) => ({
      type: "folder" as const,
      name,
      path: prefix ? `${prefix}/${name}` : name,
      children: toNodes(child, prefix ? `${prefix}/${name}` : name),
    }));
  const files: TreeNode[] = folder.files
    .sort((a, b) => comparePath(a.path, b.path))
    .map((entry) => ({
      type: "file" as const,
      name: entry.path.slice(entry.path.lastIndexOf("/") + 1),
      path: entry.path,
      kind: isDrawingPath(entry.path) ? ("drawing" as const) : ("doc" as const),
      url: docUrl(entry.path),
    }));
  return [...folders, ...files];
}

/** 문서 폴더마다 하나의 그룹을 만들고, 그 안은 폴더 → 파일 순의 중첩 트리로 만든다. */
export function buildTreeGroups(entries: TreeEntry[], docsPaths: string[]): TreeGroup[] {
  const roots = docsPaths.length === 0 ? [""] : docsPaths;
  const byRoot = new Map<string, MutableFolder>(
    roots.map((root) => [root, { folders: new Map(), files: [] }]),
  );

  for (const entry of filterDocTree(entries, docsPaths)) {
    const root = rootOf(entry.path, docsPaths);
    if (root === null) continue;
    const relative = root ? entry.path.slice(root.length + 1) : entry.path;
    const parts = relative.split("/");
    let folder = byRoot.get(root)!;
    for (const part of parts.slice(0, -1)) {
      let next = folder.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push(entry);
  }

  return roots
    .map((root) => {
      const folder = byRoot.get(root)!;
      return { root, label: root || "/", nodes: toNodes(folder, root) };
    })
    .filter((group) => group.nodes.length > 0);
}
