import { loadPushDeps } from "@/lib/push/deps";
import { createReminderHandler } from "@/lib/reminders/handler";

// Vercel Cron이 매일 한 번 GET으로 부른다. 항상 요청 시점에 실행해야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export const GET = createReminderHandler({
  env: () => process.env,
  loadDeps: () => loadPushDeps(),
  now: () => new Date(),
});
