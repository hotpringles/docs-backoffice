export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** 문서 이름(확장자 없이): `a/b.md` → `b`, `a/c.excalidraw.md` → `c.excalidraw` */
export function nameWithoutMd(path: string): string {
  return basename(path).replace(/\.md$/i, "");
}

/** 화면에 보일 이름: `.excalidraw.md`와 `.md`를 뗀다. */
export function displayName(path: string): string {
  return basename(path).replace(/\.excalidraw\.md$/i, "").replace(/\.md$/i, "");
}

/**
 * baseDir 기준 상대 경로를 저장소 루트 기준 경로로 바꾼다.
 * `/`로 시작하면 저장소 루트 기준이다. 루트 밖으로 나가면 null.
 */
export function resolveRepoPath(baseDir: string, target: string): string | null {
  const parts = target.startsWith("/") || !baseDir ? [] : baseDir.split("/");
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}
