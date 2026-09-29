import { isMarkdownPath, isUnderPaths } from "../github/tree";

export type WebhookDecision =
  | { kind: "ignore"; reason: string }
  | { kind: "pong" }
  | {
      kind: "push";
      /** push 뒤의 커밋 SHA (알림 중복 방지 키로 쓴다) */
      commitSha: string | null;
      /** 표시 대상 문서 폴더 아래에서 바뀐(추가·수정·삭제된) .md 경로 */
      changedDocs: string[];
    };

type DecideConfig = { branch: string; docsPaths: string[] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectChangedDocs(commits: unknown, cfg: DecideConfig): string[] {
  const changed = new Set<string>();
  if (!Array.isArray(commits)) return [];
  for (const commit of commits) {
    const record = asRecord(commit);
    if (!record) continue;
    for (const key of ["added", "modified", "removed"] as const) {
      const paths = record[key];
      if (!Array.isArray(paths)) continue;
      for (const path of paths) {
        if (typeof path === "string" && isMarkdownPath(path) && isUnderPaths(path, cfg.docsPaths)) {
          changed.add(path);
        }
      }
    }
  }
  return [...changed].sort();
}

/** GitHub webhook 이벤트를 보고 무엇을 할지 결정한다. 부수 효과는 없다. */
export function decideWebhook(event: string | null, payload: unknown, cfg: DecideConfig): WebhookDecision {
  if (event === "ping") return { kind: "pong" };
  if (event !== "push") return { kind: "ignore", reason: "push 이벤트가 아니에요" };

  const body = asRecord(payload);
  if (!body) return { kind: "ignore", reason: "본문 모양이 이상해요" };
  if (body.ref !== `refs/heads/${cfg.branch}`) return { kind: "ignore", reason: "다른 브랜치예요" };
  if (body.deleted === true) return { kind: "ignore", reason: "브랜치가 삭제됐어요" };

  return {
    kind: "push",
    commitSha: typeof body.after === "string" ? body.after : null,
    changedDocs: collectChangedDocs(body.commits, cfg),
  };
}
