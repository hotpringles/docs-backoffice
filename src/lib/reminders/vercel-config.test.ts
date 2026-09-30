import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type VercelConfig = { crons?: { path: string; schedule: string }[] };
const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;

describe("vercel.json의 cron", () => {
  it("일정 알림 cron이 하나 있고, 매일 UTC 00:00(한국시간 09:00~09:59경)에 돈다", () => {
    expect(config.crons).toHaveLength(1);
    expect(config.crons?.[0]).toEqual({ path: "/api/cron/reminders", schedule: "0 0 * * *" });
  });

  it("Hobby는 하루 한 번만 허용되므로 일·월·요일은 모두 *이다", () => {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = (config.crons?.[0].schedule ?? "").split(" ");
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
  });

  it("cron이 부르는 경로에 라우트 파일이 있다", () => {
    expect(existsSync("src/app/api/cron/reminders/route.ts")).toBe(true);
  });
});
