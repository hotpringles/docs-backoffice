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

## 푸시 알림 설정

`develop`에서 표시 대상 문서가 바뀌면 구독한 기기에 알림을 보냅니다. 로그인이 없어서 누구나 종 아이콘으로 구독할 수 있습니다(구독은 최대 100대).

1. Neon Postgres를 만들고 연결 문자열을 `DATABASE_URL`에 넣습니다. (Vercel에서는 Marketplace의 Neon을 프로젝트에 연결하면 환경변수가 자동으로 들어갑니다.)
2. `npm run vapid`로 키 한 쌍을 만들어 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`에 넣고, `VAPID_SUBJECT`(예: `mailto:me@example.com`)도 채웁니다.
3. `npm run db:migrate`로 테이블을 만듭니다.
4. 사이트를 열고 헤더의 종 아이콘 → "알림 받기"를 누릅니다. `npm run push:test`로 알림이 오는지 확인합니다.

- **iPhone·iPad**는 Safari의 공유 버튼 → **홈 화면에 추가**로 설치한 앱에서만 알림을 받을 수 있습니다(iOS 16.4 이상).
- **개발 중에는** 서비스 워커와 푸시가 `http://localhost`에서도 동작합니다. 폰에서 확인하려면 HTTPS 주소(배포)가 필요합니다.
- 알림에 필요한 환경변수가 하나라도 없으면 알림만 건너뛰고, 문서 화면과 webhook 처리는 그대로 동작합니다(서버 로그에 무엇이 빠졌는지 남습니다).
- 문서가 바뀐 push는 GitHub이 같은 이벤트를 다시 보내도(수동 재전송) 알림이 한 번만 갑니다. 다만 **아무에게도 보내지 못한 경우**(구독 목록을 못 읽었거나, 구독자가 있는데 전부 실패)에는 기록을 풀어 두므로, 원인(예: VAPID 키 오타)을 고친 뒤 GitHub webhook의 **Redeliver**로 다시 보낼 수 있습니다. 서버가 발송 도중에 멈춘 경우처럼 기록만 남고 알림이 가지 않은 드문 경우에는 다시 보내기가 막히니, 필요하면 `delete from notified_commits where sha = '<커밋 SHA>'`로 기록을 지우세요.
- 알림 문구는 문서 제목 대신 **파일 이름**을 씁니다(제목을 얻으려면 GitHub 호출이 더 필요해서 webhook 처리가 느려집니다).

## 구조

- `src/lib/transform/`: 문서를 화면용 데이터로 바꾸는 순수 함수 (frontmatter, 위키링크, 링크 다시 쓰기, sanitize, Excalidraw 추출)
- `src/lib/github/`: GitHub API 클라이언트와 파일 트리 도우미
- `src/lib/webhook/`: 서명 검증과 이벤트 판단
- `src/lib/db/`: 데이터베이스 연결(Neon), 마이그레이션 실행기, 테스트용 메모리 Postgres. 마이그레이션 SQL은 `db/migrations/`
- `src/lib/push/`: 구독 검증과 저장, 알림 문구와 발송, 브라우저 쪽 구독 로직
- `public/sw.js`: 알림을 화면에 띄우는 서비스 워커
- `src/app/`: 문서 목록(`/`), 문서 상세(`/docs/...`), webhook(`/api/github-webhook`), 구독 API(`/api/push/subscriptions`), 앱 설명(`/manifest.webmanifest`)과 아이콘

## 운영 메모

로컬 프로덕션 서버(`npm run build` 후 `npm run start`)와 실제 GitHub 저장소(`kakaotechcampus-4/ktc4-kyungpook-3`)로 확인한 결과입니다.

- 목록(`/`)은 `frontend/docs/plan`의 문서 7개를 보여주고, 문서 상세는 200으로 열립니다. 문서 폴더 밖, `.md`가 아닌 파일, 트리에 없는 경로, `%2F`가 든 경로, `..`가 든 경로는 모두 404입니다.
- webhook: 올바른 서명의 `develop` push는 200(`revalidated: true`), 틀린 서명은 401, 다른 브랜치는 202입니다. 무효화 직후 첫 문서 요청만 트리를 다시 받느라 느리고(이번 측정 0.38초, 네트워크에 따라 0.05~0.4초), 그 다음 요청은 0.02초 안팎입니다.
- Excalidraw: 실제 Obsidian 샘플(요소 597개, 한글 다수)이 브라우저에서 그려지고 한글이 깨지지 않으며 콘솔 오류가 없습니다. 큰 그림은 처음에 화면에 맞춰 10%까지 줄어들어서 글자를 읽으려면 확대해야 합니다.
- **그림 조작과 스크롤:** Excalidraw 캔버스는 터치와 휠을 모두 가져가서, 그대로 두면 폰에서 그림 위를 스와이프할 때 페이지가 스크롤되지 않습니다. 그래서 문서 글 사이의 그림은 처음에 **잠겨 있고**(터치와 휠이 페이지 스크롤로 넘어감), 그림 아래의 "그림 조작하기"를 눌러야 확대·이동할 수 있으며 "그림 조작 끝내기"로 다시 잠급니다. 그림 단독 화면(`크게 보기`)은 처음부터 조작할 수 있습니다. 브라우저에서 잠금, 해제, 재잠금을 확인했습니다.

배포 주소와 실제 push의 반영 시간은 배포 후 이 절에 추가합니다.
