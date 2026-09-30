import { todayInSeoul } from "@/lib/events/dates";
import { nothingDelivered, sendToAll, type PushDeps, type SendSummary } from "@/lib/push/send";
import { claimDueReminders, releaseReminders } from "./claim";
import { reminderPayload } from "./format";

export type RunResult = {
  today: string;
  claimed: number;
  summary: SendSummary | null;
  /** 발송이 전부 실패해서 차지한 기록을 풀었는지 */
  released: boolean;
};

/**
 * 하루 한 번 돌아서 오늘 알릴 일정을 구독자 전체에게 한 통으로 보낸다.
 * 보낼 항목을 먼저 차지하므로 같은 날 두 번 실행돼도 알림은 한 번이다. 다만 아무에게도 보내지 못했다면
 * (발송이 예외로 끝났거나, 구독자가 있는데 전부 실패) 기록을 풀어서 원인을 고친 뒤 다시 호출하면 재시도된다.
 */
export async function runReminders({ db, sender }: PushDeps, now: Date): Promise<RunResult> {
  const today = todayInSeoul(now);
  const items = await claimDueReminders(db, today);
  if (items.length === 0) return { today, claimed: 0, summary: null, released: false };

  let summary: SendSummary;
  try {
    summary = await sendToAll(db, sender, reminderPayload(items));
  } catch (error) {
    await releaseReminders(db, items).catch(() => undefined);
    throw error;
  }

  if (nothingDelivered(summary)) {
    await releaseReminders(db, items);
    return { today, claimed: items.length, summary, released: true };
  }
  return { today, claimed: items.length, summary, released: false };
}
