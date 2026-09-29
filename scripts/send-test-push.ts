// 구독한 모든 기기에 시험 알림을 보낸다. 폰에서 알림이 오는지 확인할 때 쓴다.
// 사용법: npm run push:test -- "제목" "본문" ["/열-경로"]
import { createNeonDb } from "../src/lib/db/neon";
import { loadPushConfig } from "../src/lib/push/config";
import { createWebPushSender, sendToAll } from "../src/lib/push/send";

async function main(): Promise<void> {
  const config = loadPushConfig();
  if (!config.ok) {
    console.error(`푸시 설정이 부족해요: ${config.missing.join(", ")}`);
    process.exit(1);
  }

  const [title = "시험 알림", body = "이 알림이 보이면 푸시가 잘 동작하는 거예요.", url = "/"] = process.argv.slice(2);
  const db = createNeonDb(config.config.databaseUrl);
  const summary = await sendToAll(db, createWebPushSender(config.config.vapid), { title, body, url, tag: "test" });

  console.log(`구독 ${summary.total}개 중 발송 ${summary.sent}, 만료로 삭제 ${summary.removed}, 실패 ${summary.failed}`);
  if (summary.total === 0) console.log("구독한 기기가 없어요. 사이트에서 종 아이콘을 눌러 알림을 켜 주세요.");
}

main().catch((error) => {
  console.error("시험 알림을 보내지 못했어요:", error instanceof Error ? error.message : error);
  process.exit(1);
});
