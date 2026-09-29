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
 * - 같은 커밋(GitHub webhook 수동 재전송 포함)은 한 번만 보낸다. 보내기 전에 커밋 SHA를 먼저 기록한다
 *   (동시에 두 번 들어와도 기본 키 충돌로 한 쪽만 통과한다).
 * - 다만 아무에게도 보내지 못했다면(구독 목록을 못 읽었거나, 구독자가 있는데 전부 실패) 기록을 풀어서,
 *   원인을 고친 뒤 GitHub에서 "Redeliver"로 다시 보낼 수 있게 한다. 일부라도 받았거나, 실패 없이
 *   만료된 구독만 정리된 경우에는 기록을 남긴다(다시 보내면 받은 사람에게 중복 알림이 간다).
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

  const release = async () => {
    if (!input.commitSha) return;
    await deps.db.query("delete from notified_commits where sha = $1", [input.commitSha]).catch(() => undefined);
  };

  let summary: SendSummary;
  try {
    summary = await sendToAll(deps.db, deps.sender, docsChangedPayload(input.changedDocs));
  } catch (error) {
    await release();
    throw error;
  }
  if (summary.total > 0 && summary.sent === 0 && summary.failed > 0) await release();
  return { status: "sent", summary };
}
