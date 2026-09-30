import "server-only";
import { getDbOrNull } from "@/lib/db";
import { createAuthHandlers } from "./handlers";

/** 실제 환경(환경변수, Neon, 현재 시각)에 연결한 로그인·로그아웃 핸들러. */
export const authHandlers = createAuthHandlers({
  getDb: () => getDbOrNull(),
  env: () => process.env,
  now: () => new Date(),
  secureCookies: process.env.NODE_ENV === "production",
});
