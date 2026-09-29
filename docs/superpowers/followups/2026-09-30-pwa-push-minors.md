# 계획 2(PWA·푸시 알림) 최종 검토에서 보류한 항목

최종 검토(범위 `54be123..9a8bfb1`)에서 Critical 1건과 Important 3건은 같은 브랜치에서 고쳤다(`a8cd244`, `bb67129`, `0a09ce7`, `f2eef67`). 아래는 고치지 않고 미룬 것과 그 이유다.

## Minor (보류)

| # | 위치 | 내용 | 메모 |
|---|------|------|------|
| 5 | `src/lib/push/subscriptions.ts` | 구독 키를 모양(길이·문자)만 검사한다. `"B" × 87`도 통과한다. | 가짜 키로 100대 상한을 채우면 진짜 사용자가 429를 받는다. `p256dh`는 65바이트에 첫 바이트 `0x04`, `auth`는 16바이트인지 디코딩해서 검사하고, 곡선 위의 점인지까지 보면 가장 좋다. Task 11에서 FCM이 가짜 토큰에 어떤 상태 코드를 주는지 확인한다(404/410이 아니면 지워지지 않는다). 급하면 `delete from push_subscriptions where …`로 손으로 지운다. |
| 6 | `src/lib/push/handlers.ts` | Content-Type을 `includes("application/json")`로 본다. | 미디어 타입을 정확히 비교한다. 쿠키 인증이 없어서 실제 피해는 없다. |
| 7 | `src/lib/push/handlers.ts` | DB 오류나 잘못된 `DATABASE_URL`이면 본문 없는 500이 나가고 로그도 없다. | try/catch로 로그를 남기고 503 JSON을 돌려준다. |
| 8 | `public/sw.js` | 열린 창의 `navigate()`가 거절되면 `openWindow`로 넘어가지 않는다. `badge`가 불투명 컬러 PNG라 안드로이드에서 네모로 보인다. | navigate를 try/catch로 감싸고, 단색 투명 배지 이미지를 따로 만든다. |
| 9 | `src/lib/push/payload.ts` | 문서를 지우기만 한 push도 "업데이트됐어요"로 알리고 지워진 문서(404)를 연다. | 지워진 문서면 `/`를 열거나 문구를 바꾼다. |
| 10 | (저장소 루트) | `.gitattributes`가 없다. 윈도우 `autocrlf` 체크아웃에서는 `scripts/simulate-webhook.sh`가 CRLF가 된다. | 메인 체크아웃에서 확인: `i/lf w/crlf`이지만 Git Bash에서는 그대로 실행된다. 리눅스·CI를 대비해 `*.sh text eol=lf`를 넣는다. |
| 11 | `src/lib/db/index.ts` | `db ??=` 때문에 첫 호출 뒤에는 `env` 인자를 무시한다. | 시그니처가 실제 동작과 다르다. 운영에서는 문제없다. |
| 12 | `public/sw.js` | `pushsubscriptionchange` 처리가 없다. | 브라우저가 구독을 바꾸면 새 구독이 서버에 등록되지 않고 종은 "받는 중"으로 남는다. |
| 13 | 진행 기록 | 원장의 `tests:` 칸에 통과 개수 대신 vitest 안내 문구가 적혔다. | `task-done`이 출력 마지막 줄을 잘라 쓰기 때문이다. 전체 개수는 `Final:` 줄에 따로 적었다(28개 파일 220개 테스트). |

## 판단해서 그대로 둔 것

- 구독 API(POST/DELETE)에 IP별 요청 제한이 없다. 100대 상한과 주소 허용 목록이 이 계획의 방어선이고, Vercel 방화벽 규칙은 플랫폼 차원의 후속이다.
- DELETE는 인증이 없다. endpoint는 기기마다 다르고 남에게 보이지 않는 긴 주소이며, 발송에는 우리 VAPID 키가 필요하다.
- GitHub push 페이로드는 커밋을 최대 20개까지만 담는다. 아주 큰 push에서 오래된 커밋의 문서 변경은 알림에서 빠질 수 있다(스펙 10-6에 이미 있음).
- 이미 알린 SHA로 강제 push하면 중복 방지 때문에 알림이 가지 않는다("같은 커밋은 한 번").
- 종 패널에 바깥 클릭 닫기와 포커스 관리가 없고, 닫혀 있을 때 `aria-controls`가 없는 요소를 가리킨다.
- `package-lock.json`에서 관련 없는 선택 의존성 18개가 빠지고 `tsx`용 `esbuild`가 들어왔다(기존 패키지의 버전 변경은 없음).

## 계획 3·4와 Task 11로 넘기는 것

- **Task 11 (실제 서비스로 확인):** `next start`(번들된 web-push)로도 실제 발송이 되는지 로그로 확인한다. 지금까지는 `tsx`로 돌린 `push:test`와 설정이 없을 때의 건너뛰기 로그만 확인했다. `unsubscribe()`한 뒤 옛 endpoint가 410을 주는지, 가짜 토큰에 FCM이 주는 상태 코드도 본다.
- **webhook 실행 시간:** `export const maxDuration`을 명시할지 정한다. 구독 100대를 10개씩 묶어 10초 제한으로 보내면 최악 약 100초다(Vercel Hobby의 Fluid 기본값 300초 안).
- **`web-push` 계약 테스트:** 진짜 키로 `webpush.generateRequestDetails`를 불러 TTL, Urgency, VAPID 헤더를 확인하는 테스트를 더한다(지금 어댑터 테스트는 web-push를 목으로 바꾼다).
- **계획 3·4에 필요한 것:** `Db`에 트랜잭션/배치(모임 확정과 일정 생성을 한 번에), 범용 `sendToAllIfConfigured(payload)`(지금 `service.ts`는 문서 알림 전용), `notified_commits`/`sent_notices`/`sent_reminders`가 함께 쓰는 claim/release 헬퍼, 알림 종류마다 다른 `tag`. 하루 알림(`sent_reminders`)은 분실되면 더 아프니 같은 "아무에게도 못 보냈으면 기록을 푼다" 규칙을 따른다.
