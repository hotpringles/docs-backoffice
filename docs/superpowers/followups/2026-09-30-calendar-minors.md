# 계획 3(달력·일정·편집 코드·매일 알림) 최종 검토에서 보류한 항목

최종 검토(범위 `f0d6e88..9f977e1`)에서 Critical은 없었고 Important 2건이 나왔다. 아래 세 건과 함께 같은 브랜치에서 고쳤다.

- 로그인 잠금이 동시 요청으로 뚫리던 문제(`fe281c7`): 이제 시도를 **먼저 세고** 번호가 5 이하일 때만 코드를 평가한다.
- 명단(`PEOPLE`)에서 빠진 참석자가 든 일정을 수정할 수 없던 문제(`6525313`): 폼에는 지금 명단의 참석자만 옮긴다.
- (등급을 올려 고침) cron이 아무에게도 못 보내도 200으로 응답하던 문제: 이제 502로 알려서 Vercel 대시보드에 실패로 보인다.
- (등급을 올려 고침) PGlite를 쓰는 테스트가 기계가 바쁠 때 5초·10초 제한에 걸려 무작위로 실패하던 문제(`4b041ae`): 제한을 30초·60초로 늘렸다.

아래는 고치지 않고 미룬 것과 그 이유다.

## Minor (보류)

| # | 위치 | 내용 | 메모 |
|---|------|------|------|
| 1 | `src/lib/events/validate.ts` | 제목·메모에 NUL 문자(`\u0000`)가 있으면 검증을 통과해 Postgres가 거절하고, 사용자는 "데이터베이스에 연결하지 못했어요"(503)를 본다. `console.error`에는 메모 전체가 남는다. | `\n`, `\t` 말고 제어 문자는 필드 오류로 거절한다. 짝이 없는 서로게이트 문자는 PGlite가 받아 줬지만 진짜 Neon에서는 확인하지 못했다. |
| 3 | `src/lib/reminders/format.ts`, `public/sw.js` | 매일 알림의 `tag`가 고정(`event-reminders`)이고 `renotify`가 없다. Notifications API에서 같은 tag의 알림이 이전 것을 대체하면 기본이 **무음**이다. 어제 알림이 알림창에 남아 있으면 오늘 알림이 소리·진동 없이 올 수 있다. | tag에 날짜를 넣거나 `renotify: true`를 준다. 실제 폰에서 확인한다(Task 11). |
| 4 | `src/lib/auth/session.ts` | 쿠키를 `SESSION_SECRET`으로만 서명한다. 코드가 새서 `EDIT_CODE`만 바꾸면 이미 발급된 쿠키가 최대 7일 더 유효하다. | README와 `.env.example`은 "`SESSION_SECRET`을 바꾸면 로그인이 풀린다"고 안내한다. HMAC 키를 `SESSION_SECRET + EDIT_CODE`로 묶는 것도 방법이다. |
| 5 | `src/components/EventEditor.tsx`, `src/lib/auth/handlers.ts` | 로그아웃 요청이 실패해도 화면은 편집을 끝낸 것처럼 보이고 쿠키는 남는다. 서버 로그아웃은 Content-Type을 보지 않아서 다른 사이트의 폼 전송으로 쿠키를 지울 수 있다(불편일 뿐 침입은 아니다). | 결과를 확인하고, 서버에서도 JSON 본문을 요구한다. |
| 6 | `src/app/globals.css` | 공백 없는 긴 제목(예: 주소 100자)이 375px 폰에서 화면을 넘칠 수 있다(CSS를 읽고 판단했고 브라우저로 돌려 보지는 않았다). | `.event-title`에 `overflow-wrap: anywhere`. |
| 7 | `src/components/EventEditor.tsx`, `src/components/CalendarGrid.tsx` | 접근성. 코드 입력창·폼이 열리거나 목록으로 돌아올 때 포커스가 `<body>`로 떨어진다. 필드 오류가 `aria-describedby`·`aria-invalid`로 연결돼 있지 않다. 선택한 날짜 칸에 `aria-current`가 없다. | 코드·제목 입력칸에 `autoFocus`. |
| 8 | `src/components/EventEditor.tsx` | 컴포넌트의 상태 흐름(저장 중 401, `resume`, 로그인 뒤 삭제, 로그아웃 실패)에 자동 테스트가 없다. 손으로 걸어 본 것뿐이다. | `form.ts`처럼 순수 함수(리듀서)로 빼서 단위 테스트한다. |
| 9 | `src/lib/events/handlers.ts`, `src/lib/reminders/run.ts` | 계획 4가 복사하게 될 중복. `guarded()`(권한 → 본문 → 명단 → DB → try/catch)가 비공개 클로저다. `run.ts`의 "차지 → 발송 → 못 보냈으면 해제" 흐름이 일정 알림에 묶여 있다. | 공용 `guardedWrite`로 빼고, `run.ts`는 차지·해제 함수를 인자로 받게 해서 `sent_notices`가 재사용하게 한다. |
| 10 | `src/lib/http.ts` | "20KB"를 UTF-16 글자 수로 센다(한글 20,000자는 약 60KB). 크기 검사 전에 본문 전체를 읽는다. | Vercel의 4.5MB 상한 안이라 실해는 없다. `content-length`를 먼저 보거나 바이트로 잰다. |
| 11 | (여러 곳) | 잠금은 "5번째 실패로부터 10분"이 아니라 "첫 시도로부터 10분"까지다(README는 "10분 동안 막힙니다"). `‹`·`›`가 2000-01, 2100-12에서 조용히 이번 달로 뛴다. `hashIp`와 세션 HMAC이 이름표 없이 같은 키를 쓴다. | 각각 문구·비활성화·`"ip:"`/`"session:"` 접두어로 정리한다. |
| — | `src/lib/auth/ip.ts` | IPv6는 전체 문자열을 해시해서, /64 대역(가정·모바일의 보통 할당)을 가진 클라이언트는 잠금 통을 2^64개 갖는다. | IPv6는 앞 64비트로 묶는다. |

## 판단해서 그대로 둔 것

- 일정 조회(제목·메모·참석자 이름)와 알림 구독에 인증이 없다. 스펙 5.6과 Global Constraints가 정한 바다.
- 하루가 통째로 누락된 cron은 보정하지 않고, 함수가 발송 도중 죽으면 그날 기록이 남는다(최대 한 번). 스펙 5.7이 받아들인 것이고 Vercel도 누락·중복 전달을 문서로 알린다. 그날 알림은 엔드포인트를 수동 호출해서 보낼 수 있다.
- 세션을 하나씩 취소할 수는 없다(스펙 5.8). 전부 취소하려면 `SESSION_SECRET`을 바꾼다.
- `sent_reminders`(일정×알림 시점당 한 행)와 `auth_attempts`(IP를 바꿔 가며 시도할 때 쌓임, 성공 시에만 삭제)는 5명 팀에서는 아주 작게 유지된다.

## 계획 4로 넘기는 것

- 모임 알림은 `sent_notices(kind, ref_id)`에 **일정 알림과 같은 패턴**을 쓴다: 먼저 차지 → 발송 → 구독자가 있는데 전부 실패하면 해제 → 실패는 502처럼 눈에 띄게 알림. `reminders/claim.ts`, `run.ts`, `handler.ts`와 각 테스트가 견본이다.
- 위 #9(공용 `guardedWrite`)를 계획 4 시작 때 먼저 한다.
- 로그인 잠금은 이제 `recordAttempt`(먼저 세기)다. 모임 만들기·확정도 같은 편집 세션(`requireEditSession`)을 그대로 쓴다.
