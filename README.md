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

## 명령

```bash
npm test            # 단위 테스트
npm run typecheck   # 타입 검사
npm run lint        # 린트
npm run build       # 프로덕션 빌드
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

## 구조

- `src/lib/transform/`: 문서를 화면용 데이터로 바꾸는 순수 함수 (frontmatter, 위키링크, 링크 다시 쓰기, sanitize, Excalidraw 추출)
- `src/lib/github/`: GitHub API 클라이언트와 파일 트리 도우미
- `src/lib/webhook/`: 서명 검증과 이벤트 판단
- `src/app/`: 문서 목록(`/`), 문서 상세(`/docs/...`), webhook 엔드포인트(`/api/github-webhook`)

## 운영 메모

로컬 프로덕션 서버(`npm run build` 후 `npm run start`)와 실제 GitHub 저장소(`kakaotechcampus-4/ktc4-kyungpook-3`)로 확인한 결과입니다.

- 목록(`/`)은 `frontend/docs/plan`의 문서 7개를 보여주고, 문서 상세는 200으로 열립니다. 문서 폴더 밖, `.md`가 아닌 파일, 트리에 없는 경로, `%2F`가 든 경로, `..`가 든 경로는 모두 404입니다.
- webhook: 올바른 서명의 `develop` push는 200(`revalidated: true`), 틀린 서명은 401, 다른 브랜치는 202입니다. 무효화 직후 첫 문서 요청만 트리를 다시 받느라 느리고(이번 측정 0.38초, 네트워크에 따라 0.05~0.4초), 그 다음 요청은 0.02초 안팎입니다.
- Excalidraw: 실제 Obsidian 샘플(요소 597개, 한글 다수)이 브라우저에서 그려지고 한글이 깨지지 않으며 콘솔 오류가 없습니다. 큰 그림은 처음에 화면에 맞춰 10%까지 줄어들어서 글자를 읽으려면 확대해야 합니다.
- **알려진 동작:** 그림 위에서 마우스 휠을 돌리면 그림이 확대·이동하고 페이지 스크롤은 막힙니다(휠 이벤트가 그림에서 처리됨). 긴 문서 중간에 그림이 있으면 그 구간에서 스크롤이 걸릴 수 있습니다. 그림 밖(글 영역)에서는 정상 스크롤됩니다.

배포 주소와 실제 push의 반영 시간은 배포 후 이 절에 추가합니다.
