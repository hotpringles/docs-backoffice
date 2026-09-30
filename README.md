# docs-backoffice

공개 GitHub 저장소의 `develop` 브랜치에 있는 Markdown 문서를 읽기 전용 웹으로 보여줍니다. Obsidian 위키링크(`[[ ]]`)와 Obsidian Excalidraw 플러그인 그림(`.excalidraw.md`)도 지원하고, `develop`에 push하면 GitHub webhook으로 바로 최신 내용을 보여줍니다.

설계는 `docs/superpowers/specs/2026-09-30-docs-backoffice-design.md`, 구현 계획은 `docs/superpowers/plans/`에 있습니다.

## 로컬에서 실행하기

Node.js 20.9 이상이 필요합니다(24에서 확인).

```bash
npm install
cp .env.example .env.local   # 값을 채운다
npm run dev
```

`http://localhost:3000`에서 확인합니다. 개발 모드에서는 캐시가 적용되지 않아 매 요청마다 GitHub에서 다시 가져옵니다.

## 환경변수

| 이름 | 설명 |
|---|---|
| `GITHUB_REPO` | 문서를 읽어올 저장소 (`소유자/이름`) |
| `GITHUB_BRANCH` | 표시할 브랜치. 비우면 `develop` |
| `DOCS_PATHS` | 표시할 문서 폴더 목록, 쉼표로 구분, 하위 폴더 포함. 비우면 저장소 전체 |
| `GITHUB_TOKEN` | 읽기 전용 토큰. 없어도 되지만 GitHub API가 시간당 60회로 제한된다(토큰이 있으면 5,000회) |
| `GITHUB_WEBHOOK_SECRET` | webhook 서명 비밀키. 저장소 webhook 설정에 넣은 값과 같아야 한다 |
| `DATABASE_URL` | Neon Postgres 연결 문자열 (푸시 알림) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | 웹 푸시 VAPID 키 한 쌍 (푸시 알림) |
| `VAPID_SUBJECT` | `mailto:이메일` 또는 `https://주소` (푸시 알림) |
| `EDIT_CODE` | 일정을 바꿀 때 입력하는 팀 공용 편집 코드 (8자 이상, 16자 이상 무작위 권장) |
| `SESSION_SECRET` | 편집 쿠키 서명용 비밀키 (16자 이상). 바꾸면 기존 편집 로그인이 모두 풀린다 |
| `CRON_SECRET` | 일정 알림 cron 인증용 (16자 이상). Vercel이 `Authorization: Bearer` 헤더로 자동 전송한다 |
| `PEOPLE` | 참가자 명단 `p1:참가자 1,p2:참가자 2,...` (1~10명, 비우면 `참가자 1~5`) |
| `LOCAL_MEMORY_DB` | `1`이면 Neon 없이 메모리 DB로 달력을 미리 본다 (개발 모드 전용) |

## 명령

```bash
npm test            # 단위 테스트
npm run typecheck   # 타입 검사
npm run lint        # 린트
npm run build       # 프로덕션 빌드
npm run vapid       # 푸시 알림용 VAPID 키 한 쌍 만들기
npm run db:migrate  # Neon에 마이그레이션 적용 (DATABASE_URL 필요, 여러 번 실행해도 안전)
npm run push:test -- "제목" "본문"   # 구독한 모든 기기에 시험 알림 보내기
```

webhook 요청을 흉내 내려면 서버를 띄운 뒤 다음을 실행합니다.

```bash
scripts/simulate-webhook.sh http://localhost:3112 <비밀키>
```

## GitHub webhook 등록

문서 저장소의 Settings → Webhooks → Add webhook (저장소 관리자 권한 필요).

- Payload URL: `https://<배포 주소>/api/github-webhook`
- Content type: `application/json`
- Secret: `GITHUB_WEBHOOK_SECRET`과 같은 값
- Events: Just the push event

## 달력과 일정

헤더의 **달력**(`/calendar`)에서 월 달력으로 일정을 봅니다. 날짜를 누르면 그날의 일정이 나오고, **일정 추가·수정·삭제**는 팀 편집 코드(`EDIT_CODE`)를 아는 사람만 할 수 있습니다. 바꾸려 할 때 코드를 묻고, 맞으면 7일 동안 기억합니다. 조회는 코드 없이 됩니다.

- 일정에는 제목, 날짜, 시각(종일 또는 시작~종료), 메모, 참석자, 알림 시점(당일·1일 전·3일 전)이 있습니다.
- 편집 코드를 5번 틀리면 그 IP는 10분 동안 막힙니다.
- **일정 알림:** 매일 한 번(한국시간 오전 9시~9시 59분 사이) 오늘 알릴 일정을 구독한 기기 전체에 한 통으로 보냅니다. Vercel Hobby의 cron은 하루 한 번만 되고, 실행 시각이 그 시(時) 안에서 흔들립니다. 보낼 항목을 먼저 기록하므로 같은 날 두 번 실행돼도 알림은 한 번이고, 아무에게도 못 보냈으면 기록을 풀어서 다시 호출하면 재시도됩니다. Vercel은 cron 전달이 드물게 누락되거나 중복될 수 있다고 안내하고, 실패해도 다시 시도하지 않습니다.
- 알림을 수동으로 보내 보려면(서버를 띄운 뒤나 배포 후): `curl -H "Authorization: Bearer <CRON_SECRET>" https://<주소>/api/cron/reminders`
- 필요한 값 만들기: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`를 세 번 실행해서 `EDIT_CODE`(팀에게 알릴 것), `SESSION_SECRET`, `CRON_SECRET`에 각각 넣습니다. 편집 코드는 저장소나 공개 채팅에 올리지 마세요.
- **Neon 없이 미리 보기:** `.env.local`에 `LOCAL_MEMORY_DB=1`, `EDIT_CODE=...`, `SESSION_SECRET=...`을 넣고 `npm run dev`를 실행하면 메모리 데이터베이스로 달력을 써 볼 수 있습니다(서버를 다시 켜면 일정이 사라집니다). 일정 알림까지 시험하려면 `DATABASE_URL=local-memory`와 VAPID 값, `CRON_SECRET`도 넣습니다.
- 참가자 명단은 `PEOPLE`로 정합니다. 일정의 참석자는 번호(`p1`)로 저장되므로, 나중에 실제 이름으로 바꿔도 기록이 유지됩니다.

## 모임(모두의 시간)

헤더의 **모임**(`/meetups`)에서 여럿이 모두 되는 시간을 찾습니다.

1. **모임 만들기**(편집 코드 필요): 제목, 후보 날짜(시작~끝, 최대 14일), 하루 시작·끝 시각(기본 09:00~22:00, 30분 단위)을 정합니다. 만들면 구독한 기기로 "새 모임" 알림이 갑니다.
2. **내 시간**: 위에서 내 이름을 고르고(마지막 선택은 이 기기가 기억합니다), 30분 칸을 눌러 가능한 시간을 표시한 뒤 저장합니다. 마우스는 끌어서 칠하고, 폰은 칸을 탭하면 한 칸씩 켜고 끄며 **칸을 꾹(0.3초) 누른 채 끌면** 지나가는 칸을 한꺼번에 칠합니다(꾹 누르지 않고 끌면 화면이 스크롤됩니다). 날짜를 누르면 그 날 전체를 켜고 끕니다. **편집 코드는 필요 없고** 이름만 고르면 됩니다(남의 이름으로도 고칠 수 있으니 팀 안에서만 쓰세요). 저장하면 그 사람의 칸이 통째로 바뀝니다.
3. **전체 결과**: 같은 표가 히트맵입니다(가능한 사람이 많을수록 진하고, 칸을 누르면 이름이 보입니다). 아래에 추천 시간 Top 3가 나옵니다(1시간 이상 이어지고, 그 구간 내내 가능한 사람이 많은 순서).
4. **시간 확정**(편집 코드 필요): 추천 중에서 고르거나 날짜와 시작·끝을 직접 입력하고 알림 시점을 정하면, 달력에 일정이 생기고 그 시간에 **끝까지 가능한 사람이 참석자**로 들어갑니다. 구독한 기기로 "모임 확정" 알림이 갑니다. 확정된 모임은 더 이상 바꿀 수 없고, 달력에서는 다른 색으로 보입니다.
5. 모임을 삭제해도(편집 코드 필요) 확정으로 만든 일정은 남습니다.

알림 설정(`DATABASE_URL`, VAPID 키)이 없어도 모임은 만들고 쓸 수 있고, 알림만 건너뜁니다.

## 푸시 알림 설정

구독한 기기에 알림을 보낼 수 있는 기반입니다. 알림은 **일정(전날·당일)과 모임(열림·확정) 소식용**이고, 그 알림을 보내는 기능은 이후 계획에서 추가됩니다. **문서가 바뀌었다는 알림은 보내지 않습니다.** 지금은 `npm run push:test`로 보내는 시험 알림만 갑니다. 로그인이 없어서 누구나 종 아이콘으로 구독할 수 있습니다(구독은 최대 100대).

1. Neon Postgres를 만들고 연결 문자열을 `DATABASE_URL`에 넣습니다. (Vercel에서는 Marketplace의 Neon을 프로젝트에 연결하면 환경변수가 자동으로 들어갑니다.)
2. `npm run vapid`로 키 한 쌍을 만들어 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`에 넣고, `VAPID_SUBJECT`(예: `mailto:me@example.com`)도 채웁니다.
3. `npm run db:migrate`로 테이블을 만듭니다.
4. 사이트를 열고 헤더의 종 아이콘 → "알림 받기"를 누릅니다. `npm run push:test`로 알림이 오는지 확인합니다.

- **iPhone·iPad**는 Safari의 공유 버튼 → **홈 화면에 추가**로 설치한 앱에서만 알림을 받을 수 있습니다(iOS 16.4 이상).
- **개발 중에는** 서비스 워커와 푸시가 `http://localhost`에서도 동작합니다. 폰에서 확인하려면 HTTPS 주소(배포)가 필요합니다.
- 알림 환경변수(`DATABASE_URL`, VAPID 키)가 없어도 문서 화면과 webhook은 그대로 동작합니다. 종 아이콘으로 구독하려 하면 "준비되지 않았어요" 같은 안내가 나올 뿐입니다.

## 구조

- `src/lib/transform/`: 문서를 화면용 데이터로 바꾸는 순수 함수 (frontmatter, 위키링크, 링크 다시 쓰기, sanitize, Excalidraw 추출)
- `src/lib/github/`: GitHub API 클라이언트와 파일 트리 도우미
- `src/lib/webhook/`: 서명 검증과 이벤트 판단
- `src/lib/db/`: 데이터베이스 연결(Neon), 마이그레이션 실행기, 테스트용 메모리 Postgres. 마이그레이션 SQL은 `db/migrations/`
- `src/lib/push/`: 구독 검증과 저장, 알림 문구와 발송, 브라우저 쪽 구독 로직
- `public/sw.js`: 알림을 화면에 띄우는 서비스 워커
- `src/lib/events/`, `src/lib/calendar/`: 일정 검증·저장·쓰기 API와 월 달력 계산
- `src/lib/auth/`: 편집 코드 로그인(서명 쿠키, 실패 잠금)
- `src/lib/reminders/`: 일정 알림(보낼 항목 차지·해제, 문구, cron 요청 처리). cron 설정은 `vercel.json`
- `src/app/`: 문서 목록(`/`), 문서 상세(`/docs/...`), webhook(`/api/github-webhook`), 구독 API(`/api/push/subscriptions`), 앱 설명(`/manifest.webmanifest`)과 아이콘

## 운영 메모

로컬 프로덕션 서버(`npm run build` 후 `npm run start`)와 실제 GitHub 저장소(`kakaotechcampus-4/ktc4-kyungpook-3`)로 확인한 결과입니다.

- 목록(`/`)은 `frontend/docs/plan`의 문서 7개를 보여주고, 문서 상세는 200으로 열립니다. 문서 폴더 밖, `.md`가 아닌 파일, 트리에 없는 경로, `%2F`가 든 경로, `..`가 든 경로는 모두 404입니다.
- webhook: 올바른 서명의 `develop` push는 200(`revalidated: true`), 틀린 서명은 401, 다른 브랜치는 202입니다. 무효화 직후 첫 문서 요청만 트리를 다시 받느라 느리고(이번 측정 0.38초, 네트워크에 따라 0.05~0.4초), 그 다음 요청은 0.02초 안팎입니다.
- Excalidraw: 실제 Obsidian 샘플(요소 597개, 한글 다수)이 브라우저에서 그려지고 한글이 깨지지 않으며 콘솔 오류가 없습니다. 큰 그림은 처음에 화면에 맞춰 10%까지 줄어들어서 글자를 읽으려면 확대해야 합니다.
- **그림 조작과 스크롤:** Excalidraw 캔버스는 터치와 휠을 모두 가져가서, 그대로 두면 폰에서 그림 위를 스와이프할 때 페이지가 스크롤되지 않습니다. 그래서 문서 글 사이의 그림은 처음에 **잠겨 있고**(터치와 휠이 페이지 스크롤로 넘어감), 그림 아래의 "그림 조작하기"를 눌러야 확대·이동할 수 있으며 "그림 조작 끝내기"로 다시 잠급니다. 그림 단독 화면(`크게 보기`)은 처음부터 조작할 수 있습니다. 브라우저에서 잠금, 해제, 재잠금을 확인했습니다.

배포 주소와 실제 push의 반영 시간은 배포 후 이 절에 추가합니다.
