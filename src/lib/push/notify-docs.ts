import { docUrl } from "@/lib/github/tree";
import type { Db } from "@/lib/db/types";
import { displayName } from "@/lib/transform/paths";
import type { PushPayload } from "./payload";
import { nothingDelivered, sendToAll, type PushDeps, type PushDepsResult, type SendSummary } from "./send";
import { shorten } from "./text";

const MAX_NAMES = 3;
const MAX_URL_LENGTH = 500;

/**
 * 문서가 바뀌었다는 알림. 제목 대신 파일 이름을 쓴다(문서 제목을 얻으려면 GitHub 호출이 더 필요하고 처리 시간이 늘어난다).
 * 한 문서만 바뀌었으면 그 문서를, 여러 개면 목록을 연다. tag는 push(커밋)마다 달라서 연달아 올라와도 서로 덮어쓰지 않는다.
 */
export function docsChangedPayload(commitSha: string | null, changedDocs: string[]): PushPayload {
  const names = changedDocs.slice(0, MAX_NAMES).map((path) => shorten(displayName(path)));
  const rest = changedDocs.length - names.length;
  const body = rest > 0 ? `${names.join(", ")} 외 ${rest}건` : names.join(", ");

  const singleUrl = changedDocs.length === 1 ? docUrl(changedDocs[0]) : "/";
  return {
    title: "문서가 업데이트됐어요",
    body,
    url: singleUrl.length <= MAX_URL_LENGTH ? singleUrl : "/",
    tag: commitSha ? `docs-${commitSha.slice(0, 12)}` : "docs-updated",
  };
}

/** 이 커밋의 알림을 보낼 권리를 차지한다. 처음이면 true, 이미 차지돼 있으면 false. 한 문장이라 동시에 불러도 하나만 true다. */
export async function claimCommit(db: Db, sha: string): Promise<boolean> {
  const rows = await db.query<{ sha: string }>("insert into notified_commits (sha) values ($1) on conflict do nothing returning sha", [sha]);
  return rows.length > 0;
}

export async function releaseCommit(db: Db, sha: string): Promise<void> {
  await db.query("delete from notified_commits where sha = $1", [sha]);
}

export type DocsNoticeResult =
  | { status: "skipped-no-docs" }
  | { status: "skipped-duplicate" }
  | { status: "sent"; summary: SendSummary; released: boolean };

/**
 * `develop` push에서 표시 대상 문서가 바뀌었을 때 구독자에게 알린다.
 * - 바뀐 문서가 없으면 보내지 않는다.
 * - 같은 커밋은 한 번만 보낸다. 먼저 차지하므로 같은 요청이 동시에 와도 한 번이다.
 * - 아무에게도 보내지 못했다면(발송이 예외로 끝났거나, 구독자가 있는데 전부 실패) 차지를 풀어서 GitHub의 Redeliver로 다시 시도할 수 있게 한다.
 *   일부라도 받았거나, 구독자가 없거나, 만료된 구독만 정리했다면 차지를 남긴다(다시 보내면 중복 알림이 간다).
 */
export async function notifyDocsChanged(
  { db, sender }: PushDeps,
  input: { commitSha: string | null; changedDocs: string[] },
): Promise<DocsNoticeResult> {
  if (input.changedDocs.length === 0) return { status: "skipped-no-docs" };

  const sha = input.commitSha;
  if (sha && !(await claimCommit(db, sha))) return { status: "skipped-duplicate" };

  let summary: SendSummary;
  try {
    summary = await sendToAll(db, sender, docsChangedPayload(sha, input.changedDocs));
  } catch (error) {
    if (sha) await releaseCommit(db, sha).catch(() => undefined);
    throw error;
  }

  if (nothingDelivered(summary)) {
    if (sha) await releaseCommit(db, sha);
    return { status: "sent", summary, released: true };
  }
  return { status: "sent", summary, released: false };
}

/**
 * webhook에서 응답 뒤에 부르는 문서 알림. 푸시 설정(DB, VAPID)이 없으면 건너뛰고 무엇이 없는지 로그만 남긴다.
 * 응답을 돌려준 뒤에 도는 작업이라 잡아 줄 곳이 없으므로, **절대 던지지 않고** 실패는 로그로만 남긴다.
 * (캐시 무효화는 알림과 무관하게 이미 끝나 있다.)
 */
export async function notifyDocsChangedIfConfigured(
  loadDeps: () => PushDepsResult,
  input: { commitSha: string | null; changedDocs: string[] },
): Promise<void> {
  try {
    const deps = loadDeps();
    if (!deps.ok) {
      console.warn(`푸시 알림 설정이 부족해서 문서 알림을 건너뛰어요: ${deps.missing.join(", ")}`);
      return;
    }
    const result = await notifyDocsChanged(deps.deps, input);
    if (result.status === "sent" && result.released) {
      console.error(`문서 알림을 아무에게도 보내지 못했어요 (${input.commitSha ?? "커밋 번호 없음"}). 원인을 고친 뒤 GitHub의 Redeliver로 다시 시도할 수 있어요.`);
    }
  } catch (error) {
    console.error("문서 알림을 보내지 못했어요", error);
  }
}
