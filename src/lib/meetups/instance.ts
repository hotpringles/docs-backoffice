import "server-only";
import { after } from "next/server";
import { getDbOrNull } from "@/lib/db";
import { loadPushDeps } from "@/lib/push/deps";
import { createMeetupHandlers } from "./handlers";

/** 실제 환경(환경변수, Neon, 현재 시각, 응답 뒤 작업)에 연결한 모임 쓰기 핸들러. */
export const meetupHandlers = createMeetupHandlers({
  getDb: () => getDbOrNull(),
  env: () => process.env,
  now: () => new Date(),
  runAfter: (task) => after(task),
  loadPushDeps: () => loadPushDeps(),
});
