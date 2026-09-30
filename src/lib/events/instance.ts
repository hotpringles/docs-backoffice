import "server-only";
import { getDbOrNull } from "@/lib/db";
import { createEventHandlers } from "./handlers";

/** 실제 환경(환경변수, Neon, 현재 시각)에 연결한 일정 쓰기 핸들러. */
export const eventHandlers = createEventHandlers({
  getDb: () => getDbOrNull(),
  env: () => process.env,
  now: () => new Date(),
});
