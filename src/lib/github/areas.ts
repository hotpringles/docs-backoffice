/** 문서 화면에서 고를 수 있는 종류(Frontend, Backend, AI). 같은 첫 폴더 아래의 문서 폴더끼리 한 묶음이다. */
export type DocArea = { key: string; label: string; roots: string[] };

// 첫 폴더 이름 → 화면에 보일 이름. 여기에 없는 폴더는 이름을 그대로 보여 준다.
// 저장소 맨 위의 docs 폴더는 특정 종류에 속하지 않는 팀 공통 문서다.
const LABELS: Record<string, string> = { frontend: "Frontend", backend: "Backend", ai: "AI", docs: "공통 문서" };

/**
 * `DOCS_PATHS`의 문서 폴더를 첫 폴더 이름으로 묶는다(예: `ai/docs`와 `ai/decision_log`는 AI 하나).
 * 순서는 처음 나온 순서를 따른다. 문서 폴더가 없으면(저장소 전체를 보여 주는 설정) 묶음도 없다.
 */
export function docAreas(docsPaths: string[]): DocArea[] {
  const areas = new Map<string, DocArea>();
  for (const root of docsPaths) {
    const key = root.split("/")[0];
    const existing = areas.get(key);
    if (existing) existing.roots.push(root);
    else areas.set(key, { key, label: Object.hasOwn(LABELS, key) ? LABELS[key] : key, roots: [root] });
  }
  return [...areas.values()];
}

/** 주소의 `?area=` 값이 있는 종류면 그것을, 없거나 이상하면 첫 번째 종류를 고른다. 묶음이 없으면 null. */
export function pickArea(areas: DocArea[], raw: string | string[] | undefined): DocArea | null {
  if (areas.length === 0) return null;
  return (typeof raw === "string" ? areas.find((area) => area.key === raw) : undefined) ?? areas[0];
}

/** 문서 경로가 속한 종류. 어느 문서 폴더에도 없으면 undefined(폴더 경계까지 맞아야 한다). */
export function areaOfPath(areas: DocArea[], path: string): DocArea | undefined {
  return areas.find((area) => area.roots.some((root) => path.startsWith(`${root}/`)));
}
