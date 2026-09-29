import type { Db } from "@/lib/db/types";
import { docsChangedPayload } from "./payload";
import { sendToAll, type Sender, type SendSummary } from "./send";

export type NotifyDeps = { db: Db; sender: Sender };

export type NotifyResult =
  | { status: "skipped-no-docs" }
  | { status: "skipped-duplicate" }
  | { status: "sent"; summary: SendSummary };

/**
 * `develop` push에서 표시 대상 문서가 바뀌었을 때 구독자에게 알린다.
 * - 바뀐 문서가 없으면 보내지 않는다.
 * - 같은 커밋(GitHub webhook 수동 재전송 포함)은 한 번만 보낸다. 보내기 전에 커밋 SHA를 먼저 기록한다.
 */
export async function notifyDocsChanged(
  deps: NotifyDeps,
  input: { commitSha: string | null; changedDocs: string[] },
): Promise<NotifyResult> {
  if (input.changedDocs.length === 0) return { status: "skipped-no-docs" };

  if (input.commitSha) {
    const claimed = await deps.db.query<{ sha: string }>(
      "insert into notified_commits (sha) values ($1) on conflict do nothing returning sha",
      [input.commitSha],
    );
    if (claimed.length === 0) return { status: "skipped-duplicate" };
  }

  const summary = await sendToAll(deps.db, deps.sender, docsChangedPayload(input.changedDocs));
  return { status: "sent", summary };
}
