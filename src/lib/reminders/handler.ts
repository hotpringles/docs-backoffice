import { safeEqual } from "@/lib/auth/safe-equal";
import { json } from "@/lib/http";
import type { PushDepsResult } from "@/lib/push/send";
import { runReminders } from "./run";

export type ReminderHandlerDeps = {
  env: () => Record<string, string | undefined>;
  loadDeps: () => PushDepsResult;
  now: () => Date;
};

/**
 * Vercel Cron이 하루 한 번 부르는 엔드포인트. Vercel은 프로젝트에 `CRON_SECRET`이 있으면
 * `Authorization: Bearer <값>` 헤더를 붙여서 부른다. 값이 없거나 틀리면 실행하지 않는다.
 */
export function createReminderHandler({ env, loadDeps, now }: ReminderHandlerDeps) {
  return async function GET(request: Request): Promise<Response> {
    const secret = env().CRON_SECRET?.trim();
    // 비밀 값이 없으면 누구든 부를 수 있게 되므로, 열어 두지 않고 막는다.
    if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
    if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
      return json({ error: "인증되지 않았어요." }, 401);
    }

    const pushDeps = loadDeps();
    if (!pushDeps.ok) {
      console.warn(`푸시 알림 설정이 부족해서 일정 알림을 보내지 못해요: ${pushDeps.missing.join(", ")}`);
      return json({ error: "푸시 알림 설정이 부족해요.", missing: pushDeps.missing }, 503);
    }

    try {
      const result = await runReminders(pushDeps.deps, now());
      // 아무에게도 보내지 못했으면(기록은 이미 풀려서 다시 호출하면 재시도된다) 오류로 응답한다.
      // Vercel은 cron을 다시 시도하지 않고 대시보드에 응답 코드만 보여주므로, 200이면 실패가 묻힌다.
      if (result.released) {
        return json({ error: "일정 알림을 아무에게도 보내지 못했어요. 다시 호출하면 재시도해요.", ...result }, 502);
      }
      return json(result);
    } catch (error) {
      console.error("일정 알림을 보내지 못했어요", error);
      return json({ error: "일정 알림을 보내지 못했어요." }, 500);
    }
  };
}
