# 문서 뷰어 구현 계획 (계획 1/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 GitHub 저장소 `develop` 브랜치의 Markdown 문서(Obsidian 위키링크와 Excalidraw 그림 포함)를 읽기 전용 웹으로 보여주고, push가 오면 webhook으로 캐시를 무효화해서 바로 최신 내용을 보여준다.

**Architecture:** Next.js App Router 웹앱이 GitHub REST API로 파일 트리와 문서를 읽고, 순수 함수로 이루어진 변환 모듈(`lib/transform`)이 문서를 화면용 데이터(hast)로 바꾼다. 트리는 태그 `tree`로 10분 캐시하고 파일 내용은 blob SHA를 키로 영구 캐시하며, `POST /api/github-webhook`이 서명을 검증한 뒤 `develop` push에서만 `tree` 태그를 즉시 만료시킨다. 그림(`.excalidraw.md`)은 서버가 장면 JSON만 뽑아 넘기고 브라우저 전용 컴포넌트가 읽기 전용으로 그린다.

**Tech Stack:** Next.js 16.3.7(App Router, `cacheComponents` 끄기), React 19, TypeScript, Vitest 5, unified(remark/rehype), gray-matter, lz-string, `@excalidraw/excalidraw` 0.18

**Spec:** `docs/superpowers/specs/2026-09-30-docs-backoffice-design.md` — 이 계획은 5.1, 5.2, 5.3(캐시 무효화까지), 6.1, 6.2, 7, 8 중 문서 뷰어에 해당하는 부분을 구현한다.

## 범위와 후속 계획

이 계획은 스펙의 **문서 뷰어**만 다룬다. 스펙의 나머지는 이 계획의 코드가 생긴 뒤 그 인터페이스를 보고 따로 계획을 쓴다.

- 계획 2: PWA와 문서 갱신 알림 (Neon 연결, 구독 저장, Web Push, webhook의 알림 발송, 알림 중복 방지). 이 계획의 `decideWebhook`이 돌려주는 `commitSha`와 `changedDocs`가 계획 2의 입력이다.
- 계획 3: 일정 등록·수정·삭제, 편집 코드 인증, 하루 단위 cron 알림.

## Global Constraints

스펙의 프로젝트 전체 요구사항이다. 모든 작업이 이를 따른다.

- 문서 저장소는 `kakaotechcampus-4/ktc4-kyungpook-3`(공개), 표시 브랜치는 `develop`, 표시할 문서 폴더(`DOCS_PATHS`)의 초기값은 `frontend/docs/plan`이다.
- 화면은 읽기 전용이고 로그인이 없다. 표시하는 파일은 `.md`와 `.excalidraw.md`뿐이다.
- 파일 트리는 캐시 태그 `tree`로 캐시하고 안전장치 만료 시간은 10분(600초)이다. 파일 내용은 blob SHA를 키로 캐싱한다.
- GitHub API 인증은 읽기 전용 토큰 하나(`GITHUB_TOKEN`)이고, 인증 시 시간당 5,000회 한도 안에서 쓴다(인증 없이는 60회).
- webhook은 원본 본문을 `GITHUB_WEBHOOK_SECRET`으로 HMAC-SHA256 계산해 `X-Hub-Signature-256`과 timing-safe 비교한다. GitHub은 10초 안에 응답하지 않으면 실패로 기록한다.
- 외부 서비스(webhook)가 부르는 캐시 무효화는 `revalidateTag('tree', { expire: 0 })`이다. (Next.js 16에서 `revalidateTag`는 두 번째 인자가 필요하다.)
- 그림 안에 삽입된 이미지(`Embedded Files`)는 지원하지 않는다. 문서 안의 원본 HTML은 버리고 결과를 한 번 더 걸러(sanitize) 출력한다.
- 모바일 우선 화면이고, 다크모드는 만들지 않는다.
- 배포는 Vercel Hobby(비상업, 무급 학생 프로젝트)다.

## Review Focus

스펙이 직접 말하지 않았지만 실제로 사용자가 마주칠 가능성이 높은 입력이다. 각 항목의 테스트는 해당 작업에 들어 있다.

1. **악의적인 Markdown(XSS).** `<script>`, `onerror`, `javascript:` 주소, `<iframe>`, `style`, `data:` 이미지가 든 문서는 그런 요소가 모두 사라진 채 보여야 한다. → Task 6 `markdown.test.ts`의 "보안"
2. **이상한 URL 경로.** `/docs/` 뒤에 `..`, 인코딩된 슬래시(`%2F`), 문서 폴더 밖 경로, `.md`가 아닌 파일, 대소문자가 다른 경로가 오면 GitHub에서 아무것도 가져오지 않고 404여야 한다. → Task 3 `findDocEntry`·`pathFromSegments` 테스트, Task 11의 curl 확인
3. **이상한 webhook 본문.** 서명은 맞지만 JSON이 아닌 본문(폼 방식 webhook), 모양이 이상한 JSON, 비밀키 미설정은 서버가 죽지 않고 명확한 상태 코드(400/202/500)로 답해야 하고 캐시를 건드리면 안 된다. → Task 9 `route.test.ts`, `webhook.test.ts`
4. **깨진 문서.** YAML이 깨진 frontmatter, BOM, 빈 파일, 잘못된 % 인코딩 링크, 저장소 밖을 가리키는 상대 링크, `[[]]` 같은 쓰레기 위키링크, 손상된 Excalidraw 데이터가 있어도 그 문서(또는 그 그림 자리)만 안전하게 표시되고 페이지 전체가 깨지면 안 된다. → Task 4, 5, 6, 7 테스트
5. **GitHub 한도와 장애 중의 화면.** 한도 초과나 장애가 나면 마지막으로 성공한 내용과 "최신 내용을 불러오지 못했어요" 배너를 보여주고, 처음부터 실패하면 오류 화면(다시 시도 버튼)이 나와야 한다. → Task 8 `withStaleFallback` 테스트, Task 10의 `error.tsx`

## 파일 구조

```
package.json, tsconfig.json, next.config.ts, eslint.config.mjs   ← create-next-app이 만든다
vitest.config.mts, .env.example, README.md
scripts/simulate-webhook.sh                    ← webhook 서명 요청을 흉내 내는 확인용 스크립트
src/lib/config.ts                              ← 환경변수 → AppConfig
src/lib/github/tags.ts                         ← 캐시 태그와 만료 시간 상수
src/lib/github/tree.ts                         ← 트리 항목 필터, 경로 도우미, 트리 화면용 그룹
src/lib/github/client.ts                       ← GitHub API 클라이언트, 오류 종류, 마지막 성공 값 대체
src/lib/github/index.ts                        ← 설정으로 만든 클라이언트 인스턴스 (서버 전용)
src/lib/transform/frontmatter.ts               ← frontmatter 분리
src/lib/transform/excalidraw.ts                ← .excalidraw.md → 장면 JSON
src/lib/transform/paths.ts, repo-urls.ts       ← 경로 계산, GitHub 주소 만들기
src/lib/transform/link-index.ts                ← 이름으로 문서·첨부를 찾는 색인
src/lib/transform/nodes.ts                     ← "없는 문서" 표시 노드
src/lib/transform/links.ts                     ← 상대 링크·이미지 다시 쓰기
src/lib/transform/wikilinks.ts                 ← 위키링크·그림 임베드 변환
src/lib/transform/markdown.ts                  ← 변환 파이프라인(GFM, sanitize, 제목 id, 목차)
src/lib/transform/index.ts                     ← parseDocument (문서 하나를 화면용 데이터로)
src/lib/transform/fixtures.ts                  ← 변환 테스트가 함께 쓰는 가짜 저장소
src/lib/webhook/verify.ts, decide.ts           ← 서명 검증, 이벤트 판단
src/lib/docs.ts                                ← 문서 상세 화면용 데이터 로더 (서버 전용)
src/lib/relative-time.ts                       ← "N분 전"
src/app/api/github-webhook/route.ts            ← webhook 엔드포인트
src/app/layout.tsx, page.tsx, error.tsx, not-found.tsx, globals.css
src/app/docs/[...path]/page.tsx                ← 문서 상세
src/components/                                ← DocTree, Toc, MarkdownView, DrawingBlock, ExcalidrawView, RelativeTime, StaleBanner
```

각 파일 옆의 `*.test.ts`가 그 파일의 테스트다. 변환 모듈(`lib/transform`)은 GitHub와 Next.js를 모르는 순수 함수라서 단독으로 테스트한다.

## 작업 규칙

- 명령은 저장소 루트(`docs-backoffice`)에서 실행한다. Windows에서는 Git Bash를 쓴다.
- 작업 하나가 끝날 때마다 커밋한다. 커밋하기 전에 그 작업의 테스트가 모두 통과해야 한다.
- 테스트 이름과 화면 문구는 한국어다. 코드 식별자는 영어다.
- 이 계획의 코드는 임시 폴더에서 실제로 실행해 검증한 것이다(전체 테스트 108개, 타입 검사, 린트, 프로덕션 빌드, 프로덕션 서버에서의 목록·문서·404·webhook 요청, 실제 Excalidraw 샘플의 브라우저 렌더링). 그대로 옮기면 같은 결과가 나와야 하고, 다르면 코드가 아니라 환경 차이부터 확인한다.

---

### Task 1: 프로젝트 골격과 테스트 환경

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `src/app/*` (create-next-app이 만든다)
- Create: `vitest.config.mts`, `.env.example`
- Modify: `package.json`(스크립트), `.gitignore`, `README.md`

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, 경로 별칭 `@/*` → `src/*`

- [ ] **Step 1: Next.js 프로젝트를 현재 폴더에 만든다**

`docs/`와 `.git`이 이미 있는 폴더에서도 실행된다(확인함). 대화형 질문이 없도록 모든 옵션을 준다.

```bash
npx create-next-app@latest . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm --disable-git --yes
```

Expected: `Success! Created ...`. `docs/`는 그대로 남고 `package.json`, `src/app/`, `AGENTS.md`, `CLAUDE.md` 등이 생긴다. (`AGENTS.md`와 `CLAUDE.md`는 Next.js 코드를 최신 방식으로 쓰도록 안내하는 파일이니 지우지 않는다.)

- [ ] **Step 2: 의존성을 설치한다**

```bash
npm install unified remark-parse remark-gfm remark-rehype rehype-sanitize rehype-slug rehype-stringify hast-util-to-jsx-runtime unist-util-visit github-slugger gray-matter lz-string @excalidraw/excalidraw server-only
npm install -D @types/node@^24 vitest @types/mdast @types/hast @types/unist
```

`@types/node@^24`를 함께 지정하는 이유: create-next-app이 넣는 `@types/node@^20`이 vitest 5의 peer 의존성(`^22 || >=24`)과 충돌해서 그냥 설치하면 `ERESOLVE` 오류가 난다.

Expected: 오류 없이 끝난다.

- [ ] **Step 3: Vitest 설정을 만든다**

설정 파일 확장자를 `.mts`로 하는 이유: `.ts`로 두면 Vite가 "ESM 문법을 CommonJS로 읽었다"는 경고를 낸다.

**`vitest.config.mts`**

`````ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
`````

- [ ] **Step 4: `package.json`에 스크립트를 추가한다**

`"lint": "eslint"` 줄 바로 아래에 세 줄을 더한다.

```json
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 5: 환경변수 예시 파일과 `.gitignore` 예외를 만든다**

create-next-app이 만든 `.gitignore`는 `.env*`를 모두 무시하므로 예시 파일만 예외로 둔다. `.gitignore`의 `.env*` 줄 바로 아래에 다음 줄을 추가한다.

```
!.env.example
```

**`.env.example`**

`````dotenv
# 문서를 읽어올 GitHub 저장소 ("소유자/이름")
GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3

# 표시할 브랜치 (비우면 develop)
GITHUB_BRANCH=develop

# 표시할 문서 폴더 목록, 쉼표로 구분, 하위 폴더 포함 (비우면 저장소 전체)
DOCS_PATHS=frontend/docs/plan

# GitHub API 호출 한도를 늘리기 위한 읽기 전용 토큰. 없어도 동작하지만 시간당 60회로 제한된다.
GITHUB_TOKEN=

# GitHub webhook 서명 검증용 비밀키. 저장소의 webhook 설정에 넣은 값과 같아야 한다.
GITHUB_WEBHOOK_SECRET=
`````

- [ ] **Step 6: README를 프로젝트에 맞게 바꾼다**

create-next-app이 만든 `README.md`를 아래 내용으로 통째로 바꾼다.

**`README.md`**

`````markdown
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
`````

- [ ] **Step 7: 기본 상태를 확인한다**

```bash
npx vitest run --passWithNoTests
npm run typecheck
npm run lint
npm run build
```

Expected: 테스트는 "No test files found"로 통과, 나머지는 오류 없이 끝난다.

- [ ] **Step 8: 커밋한다**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: 설정 모듈

**Files:**
- Create: `src/lib/config.ts`
- Test: `src/lib/config.test.ts`

**Interfaces:**
- Produces:
  - `class ConfigError extends Error`
  - `type AppConfig = { repo: { owner: string; name: string }; branch: string; docsPaths: string[]; githubToken: string | undefined; webhookSecret: string | undefined }`
  - `normalizeDocsPath(input: string): string` — 공백 제거, `\` → `/`, 앞뒤 `/` 제거. `.` 또는 `..` 조각이 있으면 `ConfigError`.
  - `parseDocsPaths(raw: string | undefined): string[]` — 쉼표로 나눠 정리하고 중복을 없앤다. 비었으면 `[]`(저장소 전체).
  - `loadConfig(env?: Record<string, string | undefined>): AppConfig` — `GITHUB_REPO`가 `owner/name` 형식이 아니면 `ConfigError`. `GITHUB_BRANCH` 기본값 `develop`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/config.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseDocsPaths } from "./config";

describe("parseDocsPaths", () => {
  it("쉼표로 나누고 공백과 앞뒤 슬래시를 정리한다", () => {
    expect(parseDocsPaths(" frontend/docs/plan/ , /ai/docs ")).toEqual([
      "frontend/docs/plan",
      "ai/docs",
    ]);
  });

  it("비었거나 undefined면 빈 목록(저장소 전체)이다", () => {
    expect(parseDocsPaths(undefined)).toEqual([]);
    expect(parseDocsPaths("")).toEqual([]);
    expect(parseDocsPaths(" , ,")).toEqual([]);
  });

  it("중복을 제거하고 역슬래시를 슬래시로 바꾼다", () => {
    expect(parseDocsPaths("a\\b,a/b")).toEqual(["a/b"]);
  });

  it('".." 또는 "."가 든 항목은 거부한다', () => {
    expect(() => parseDocsPaths("a/../b")).toThrow(ConfigError);
    expect(() => parseDocsPaths("./a")).toThrow(ConfigError);
  });
});

describe("loadConfig", () => {
  it("환경변수에서 설정을 읽고 브랜치 기본값은 develop이다", () => {
    const config = loadConfig({
      GITHUB_REPO: "kakaotechcampus-4/ktc4-kyungpook-3",
      DOCS_PATHS: "frontend/docs/plan",
      GITHUB_TOKEN: " tok ",
    });
    expect(config).toEqual({
      repo: { owner: "kakaotechcampus-4", name: "ktc4-kyungpook-3" },
      branch: "develop",
      docsPaths: ["frontend/docs/plan"],
      githubToken: "tok",
      webhookSecret: undefined,
    });
  });

  it("GITHUB_REPO가 없거나 형식이 틀리면 ConfigError", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ GITHUB_REPO: "just-a-name" })).toThrow(ConfigError);
    expect(() => loadConfig({ GITHUB_REPO: "a/b/c" })).toThrow(ConfigError);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/config.test.ts`
Expected: FAIL — `./config`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/config.ts`**

`````ts
export class ConfigError extends Error {}

export type AppConfig = {
  repo: { owner: string; name: string };
  branch: string;
  /** 표시할 문서 폴더 목록(앞뒤 슬래시 없음). 비어 있으면 저장소 전체. */
  docsPaths: string[];
  githubToken: string | undefined;
  webhookSecret: string | undefined;
};

const REPO_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export function normalizeDocsPath(input: string): string {
  const path = input.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new ConfigError(`DOCS_PATHS 항목에 "." 또는 ".."를 쓸 수 없어요: ${input}`);
  }
  return path;
}

export function parseDocsPaths(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const path = normalizeDocsPath(part);
    if (path) seen.add(path);
  }
  return [...seen];
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const match = REPO_RE.exec(env.GITHUB_REPO?.trim() ?? "");
  if (!match) {
    throw new ConfigError('GITHUB_REPO는 "owner/name" 형식이어야 해요.');
  }
  return {
    repo: { owner: match[1], name: match[2] },
    branch: env.GITHUB_BRANCH?.trim() || "develop",
    docsPaths: parseDocsPaths(env.DOCS_PATHS),
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET?.trim() || undefined,
  };
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/config.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/config.ts src/lib/config.test.ts
git commit -m "feat: add app config parsing with docs paths"
```

---

### Task 3: 트리 유틸리티와 경로 검증

**Files:**
- Create: `src/lib/github/tree.ts`
- Test: `src/lib/github/tree.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type TreeEntry = { path: string; sha: string; size?: number }`
  - `type TreeNode = { type: "folder"; name; path; children: TreeNode[] } | { type: "file"; name; path; kind: "doc" | "drawing"; url: string }`, `type TreeGroup = { root: string; label: string; nodes: TreeNode[] }`
  - `isMarkdownPath(path)`, `isDrawingPath(path)` — 대소문자를 구분하지 않고 `.md`, `.excalidraw.md`를 판별
  - `isUnderPaths(path, docsPaths)` — 폴더 경계까지 일치해야 한다(`plan`은 `plan-old`와 다르다). `docsPaths`가 비면 항상 `true`.
  - `filterDocTree(entries, docsPaths): TreeEntry[]` — 표시 대상 `.md`만, 경로순
  - `findDocEntry(entries, docsPaths, path): TreeEntry | undefined` — 트리에 있고 `.md`이고 문서 폴더 안일 때만 돌려준다(**임의 경로를 가져오지 않는 관문**)
  - `encodeDocPath(path)`, `docUrl(path)` — 조각별 `encodeURIComponent`, `/docs/...`
  - `pathFromSegments(segments: string[]): string | null` — 빈 조각, `.`, `..`, `\`, `/`, NUL이 든 조각이 있으면 `null`. **디코딩은 하지 않는다**(Next.js가 `params`를 이미 디코딩해서 넘긴다).
  - `buildTreeGroups(entries, docsPaths): TreeGroup[]` — 문서 폴더마다 그룹 하나, 안은 폴더 → 파일 순의 중첩 트리. 겹치는 폴더는 가장 길게 일치하는 그룹에만 넣는다. 문서가 없는 그룹은 뺀다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/github/tree.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import {
  buildTreeGroups,
  docUrl,
  filterDocTree,
  findDocEntry,
  isDrawingPath,
  isUnderPaths,
  pathFromSegments,
  type TreeEntry,
} from "./tree";

const e = (path: string): TreeEntry => ({ path, sha: `sha-${path}` });

describe("isUnderPaths", () => {
  it("폴더 경계까지 맞아야 한다", () => {
    expect(isUnderPaths("frontend/docs/plan/a.md", ["frontend/docs/plan"])).toBe(true);
    expect(isUnderPaths("frontend/docs/plan-old/a.md", ["frontend/docs/plan"])).toBe(false);
    expect(isUnderPaths("frontend/docs/plan.md", ["frontend/docs/plan"])).toBe(false);
  });

  it("문서 폴더 목록이 비어 있으면 모두 통과한다", () => {
    expect(isUnderPaths("any/where.md", [])).toBe(true);
  });
});

describe("filterDocTree", () => {
  it(".md만 남기고 경로순으로 정렬한다", () => {
    const entries = [
      e("frontend/docs/plan/b.md"),
      e("frontend/docs/plan/a.md"),
      e("frontend/docs/plan/image.png"),
      e("frontend/src/App.tsx"),
      e("README.md"),
    ];
    expect(filterDocTree(entries, ["frontend/docs/plan"]).map((x) => x.path)).toEqual([
      "frontend/docs/plan/a.md",
      "frontend/docs/plan/b.md",
    ]);
  });

  it("대문자 확장자 .MD도 문서로 본다", () => {
    expect(filterDocTree([e("d/A.MD")], ["d"]).map((x) => x.path)).toEqual(["d/A.MD"]);
  });
});

describe("findDocEntry", () => {
  const entries = [e("d/a.md"), e("d/x.png"), e("other/b.md"), e("d/Case.md")];

  it("트리에 있고 문서 폴더 안의 .md만 찾는다", () => {
    expect(findDocEntry(entries, ["d"], "d/a.md")?.sha).toBe("sha-d/a.md");
    expect(findDocEntry(entries, ["d"], "d/Case.md")).toBeDefined();
  });

  it("폴더 밖, .md가 아닌 파일, 트리에 없는 경로, 대소문자가 다른 경로는 못 찾는다", () => {
    expect(findDocEntry(entries, ["d"], "other/b.md")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/x.png")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/nope.md")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/case.md")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/../other/b.md")).toBeUndefined();
  });
});

describe("isDrawingPath", () => {
  it(".excalidraw.md를 그림으로 구분한다", () => {
    expect(isDrawingPath("a/b.excalidraw.md")).toBe(true);
    expect(isDrawingPath("a/b.md")).toBe(false);
  });
});

describe("docUrl", () => {
  it("공백, 작은따옴표, 한글이 든 경로를 조각별로 인코딩한다", () => {
    expect(docUrl("plan/Manager's Manager 프론트엔드 흐름.excalidraw.md")).toBe(
      "/docs/plan/Manager's%20Manager%20%ED%94%84%EB%A1%A0%ED%8A%B8%EC%97%94%EB%93%9C%20%ED%9D%90%EB%A6%84.excalidraw.md",
    );
  });
});

describe("pathFromSegments", () => {
  it("정상 조각은 경로로 합친다", () => {
    expect(pathFromSegments(["a", "b.md"])).toBe("a/b.md");
  });

  it("비었거나 위험한 조각은 null이다", () => {
    expect(pathFromSegments([])).toBeNull();
    expect(pathFromSegments(["a", ".."])).toBeNull();
    expect(pathFromSegments(["."])).toBeNull();
    expect(pathFromSegments(["a", ""])).toBeNull();
    expect(pathFromSegments(["a\\b"])).toBeNull();
    expect(pathFromSegments(["a/b"])).toBeNull();
    expect(pathFromSegments(["a\0b"])).toBeNull();
  });
});

describe("buildTreeGroups", () => {
  it("문서 폴더 아래를 상대 경로의 중첩 트리로 만들고 폴더를 먼저 놓는다", () => {
    const groups = buildTreeGroups(
      [
        e("d/z.md"),
        e("d/sub/a.md"),
        e("d/sub/deep/c.md"),
        e("d/diagram.excalidraw.md"),
        e("other/x.md"),
      ],
      ["d"],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].root).toBe("d");
    expect(groups[0].label).toBe("d");
    expect(groups[0].nodes.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:sub",
      "file:diagram.excalidraw.md",
      "file:z.md",
    ]);
    const sub = groups[0].nodes[0];
    if (sub.type !== "folder") throw new Error("folder 아님");
    expect(sub.path).toBe("d/sub");
    expect(sub.children.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:deep",
      "file:a.md",
    ]);
  });

  it("그림 파일은 kind가 drawing이다", () => {
    const groups = buildTreeGroups([e("d/x.excalidraw.md"), e("d/y.md")], ["d"]);
    const kinds = groups[0].nodes.map((n) => (n.type === "file" ? n.kind : "folder"));
    expect(kinds).toEqual(["drawing", "doc"]);
  });

  it("겹치는 문서 폴더에서는 가장 길게 일치하는 그룹에만 들어간다", () => {
    const groups = buildTreeGroups([e("a/1.md"), e("a/b/2.md")], ["a", "a/b"]);
    const byRoot = Object.fromEntries(
      groups.map((g) => [g.root, g.nodes.map((n) => n.path)]),
    );
    expect(byRoot).toEqual({ a: ["a/1.md"], "a/b": ["a/b/2.md"] });
  });

  it("문서가 없는 그룹은 뺀다", () => {
    expect(buildTreeGroups([e("x/1.md")], ["d"])).toEqual([]);
  });

  it("문서 폴더 목록이 비어 있으면 저장소 전체를 하나의 그룹으로 만든다", () => {
    const groups = buildTreeGroups([e("README.md"), e("docs/a.md")], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("/");
    expect(groups[0].nodes.map((n) => n.name)).toEqual(["docs", "README.md"]);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/github/tree.test.ts`
Expected: FAIL — `./tree`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/github/tree.ts`**

`````ts
export type TreeEntry = { path: string; sha: string; size?: number };

export type TreeNode =
  | { type: "folder"; name: string; path: string; children: TreeNode[] }
  | {
      type: "file";
      name: string;
      path: string;
      kind: "doc" | "drawing";
      url: string;
    };

export type TreeGroup = { root: string; label: string; nodes: TreeNode[] };

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export function isDrawingPath(path: string): boolean {
  return path.toLowerCase().endsWith(".excalidraw.md");
}

/** docsPaths가 비어 있으면 저장소 전체. 폴더 경계까지 맞아야 한다(plan은 plan-old와 다르다). */
export function isUnderPaths(path: string, docsPaths: string[]): boolean {
  if (docsPaths.length === 0) return true;
  return docsPaths.some((root) => path.startsWith(`${root}/`));
}

/** 가장 길게 일치하는 문서 폴더. docsPaths가 비어 있으면 "" (저장소 루트). */
function rootOf(path: string, docsPaths: string[]): string | null {
  if (docsPaths.length === 0) return "";
  let best: string | null = null;
  for (const root of docsPaths) {
    if (path.startsWith(`${root}/`) && (best === null || root.length > best.length)) {
      best = root;
    }
  }
  return best;
}

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 문서 폴더 아래의 .md 파일만 남기고 경로순으로 정렬한다. */
export function filterDocTree(entries: TreeEntry[], docsPaths: string[]): TreeEntry[] {
  return entries
    .filter((entry) => isMarkdownPath(entry.path) && isUnderPaths(entry.path, docsPaths))
    .sort((a, b) => comparePath(a.path, b.path));
}

/**
 * 화면에서 열 수 있는 문서인지 확인하고 트리 항목을 돌려준다.
 * 트리에 있고, .md이고, 표시 대상 폴더 안에 있는 경로만 통과한다(임의 경로를 가져오지 않는다).
 */
export function findDocEntry(
  entries: TreeEntry[],
  docsPaths: string[],
  path: string,
): TreeEntry | undefined {
  if (!isMarkdownPath(path) || !isUnderPaths(path, docsPaths)) return undefined;
  return entries.find((entry) => entry.path === path);
}

export function encodeDocPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function docUrl(path: string): string {
  return `/docs/${encodeDocPath(path)}`;
}

/** URL 조각을 저장소 경로로 바꾼다. 비어 있거나 "."/".."/역슬래시/NUL이 있으면 null. */
export function pathFromSegments(segments: string[]): string | null {
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0") ||
      segment.includes("/")
    ) {
      return null;
    }
  }
  return segments.join("/");
}

type MutableFolder = { folders: Map<string, MutableFolder>; files: TreeEntry[] };

function toNodes(folder: MutableFolder, prefix: string): TreeNode[] {
  const folders: TreeNode[] = [...folder.folders.entries()]
    .sort(([a], [b]) => comparePath(a, b))
    .map(([name, child]) => ({
      type: "folder" as const,
      name,
      path: prefix ? `${prefix}/${name}` : name,
      children: toNodes(child, prefix ? `${prefix}/${name}` : name),
    }));
  const files: TreeNode[] = folder.files
    .sort((a, b) => comparePath(a.path, b.path))
    .map((entry) => ({
      type: "file" as const,
      name: entry.path.slice(entry.path.lastIndexOf("/") + 1),
      path: entry.path,
      kind: isDrawingPath(entry.path) ? ("drawing" as const) : ("doc" as const),
      url: docUrl(entry.path),
    }));
  return [...folders, ...files];
}

/** 문서 폴더마다 하나의 그룹을 만들고, 그 안은 폴더 → 파일 순의 중첩 트리로 만든다. */
export function buildTreeGroups(entries: TreeEntry[], docsPaths: string[]): TreeGroup[] {
  const roots = docsPaths.length === 0 ? [""] : docsPaths;
  const byRoot = new Map<string, MutableFolder>(
    roots.map((root) => [root, { folders: new Map(), files: [] }]),
  );

  for (const entry of filterDocTree(entries, docsPaths)) {
    const root = rootOf(entry.path, docsPaths);
    if (root === null) continue;
    const relative = root ? entry.path.slice(root.length + 1) : entry.path;
    const parts = relative.split("/");
    let folder = byRoot.get(root)!;
    for (const part of parts.slice(0, -1)) {
      let next = folder.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push(entry);
  }

  return roots
    .map((root) => {
      const folder = byRoot.get(root)!;
      return { root, label: root || "/", nodes: toNodes(folder, root) };
    })
    .filter((group) => group.nodes.length > 0);
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/github/tree.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/github/tree.ts src/lib/github/tree.test.ts
git commit -m "feat: add tree filtering, path validation, and tree groups"
```

---

### Task 4: frontmatter 분리

**Files:**
- Create: `src/lib/transform/frontmatter.ts`
- Test: `src/lib/transform/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `type Frontmatter = { title?: string; tags: string[]; date?: string; data: Record<string, unknown> }`
  - `type SplitResult = { frontmatter: Frontmatter; body: string; error?: string }`
  - `splitFrontmatter(raw: string): SplitResult` — BOM을 지우고 gray-matter로 읽는다. YAML이 깨졌으면 `error`에 이유를 담고 `body`는 원문 그대로 돌려준다(예외를 던지지 않는다). `date`는 `YYYY-MM-DD` 문자열, 태그는 앞의 `#`를 뗀다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/transform/frontmatter.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("제목, 태그, 날짜를 읽고 본문을 분리한다", () => {
    const { frontmatter, body, error } = splitFrontmatter(
      "---\ntitle: 계획서\ntags: [plan, '#m3']\ndate: 2026-09-28\n---\n# 본문\n",
    );
    expect(error).toBeUndefined();
    expect(frontmatter.title).toBe("계획서");
    expect(frontmatter.tags).toEqual(["plan", "m3"]);
    expect(frontmatter.date).toBe("2026-09-28");
    expect(body).toBe("# 본문\n");
  });

  it("frontmatter가 없으면 본문 전체를 돌려준다", () => {
    const { frontmatter, body } = splitFrontmatter("# 제목\n내용");
    expect(frontmatter).toEqual({ tags: [], data: {} });
    expect(body).toBe("# 제목\n내용");
  });

  it("태그가 문자열이면 쉼표나 공백으로 나눈다", () => {
    expect(splitFrontmatter("---\ntags: a, b c\n---\n").frontmatter.tags).toEqual(["a", "b", "c"]);
  });

  it("BOM이 있어도 frontmatter를 읽는다", () => {
    const { frontmatter } = splitFrontmatter("﻿---\ntitle: BOM\n---\nx");
    expect(frontmatter.title).toBe("BOM");
  });

  it("CRLF 줄바꿈도 읽는다", () => {
    const { frontmatter, body } = splitFrontmatter("---\r\ntitle: 윈도우\r\n---\r\n본문\r\n");
    expect(frontmatter.title).toBe("윈도우");
    expect(body.trim()).toBe("본문");
  });

  it("YAML이 깨져 있으면 오류를 알리고 본문은 원문 그대로 둔다", () => {
    const raw = "---\ntitle: [깨짐\n---\n본문";
    const { frontmatter, body, error } = splitFrontmatter(raw);
    expect(error).toBeTruthy();
    expect(frontmatter).toEqual({ tags: [], data: {} });
    expect(body).toBe(raw);
  });

  it("빈 문서도 문제없다", () => {
    const { frontmatter, body, error } = splitFrontmatter("");
    expect(error).toBeUndefined();
    expect(frontmatter.tags).toEqual([]);
    expect(body).toBe("");
  });

  it("같은 입력을 두 번 처리해도 결과를 공유하지 않는다", () => {
    const raw = "---\ntitle: A\n---\nx";
    const first = splitFrontmatter(raw);
    first.frontmatter.tags.push("mutated");
    expect(splitFrontmatter(raw).frontmatter.tags).toEqual([]);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/transform/frontmatter.test.ts`
Expected: FAIL — `./frontmatter`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

`matter(text, {})`에 빈 옵션 객체를 넘기는 이유: 옵션이 없으면 gray-matter가 같은 입력의 결과 객체를 캐시해서 돌려주기 때문에, 호출한 쪽이 결과를 바꾸면 다음 호출에 영향이 간다(마지막 테스트가 이를 확인한다).

**`src/lib/transform/frontmatter.ts`**

`````ts
import matter from "gray-matter";

export type Frontmatter = {
  title?: string;
  tags: string[];
  /** YYYY-MM-DD 또는 원문 문자열 */
  date?: string;
  data: Record<string, unknown>;
};

export type SplitResult = {
  frontmatter: Frontmatter;
  body: string;
  /** frontmatter 해석에 실패하면 이유가 들어간다. 이때 본문은 원문 그대로다. */
  error?: string;
};

function asTitle(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asTags(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];
  const tags = items
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => String(item).trim().replace(/^#/, ""))
    .filter(Boolean);
  return [...new Set(tags)];
}

function asDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function splitFrontmatter(raw: string): SplitResult {
  const text = raw.replace(/^﻿/, "");
  try {
    // 옵션 객체를 넘기면 gray-matter의 내부 캐시를 쓰지 않는다.
    const parsed = matter(text, {});
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    return {
      frontmatter: {
        title: asTitle(data.title),
        tags: asTags(data.tags),
        date: asDate(data.date),
        data,
      },
      body: parsed.content,
    };
  } catch (error) {
    return {
      frontmatter: { tags: [], data: {} },
      body: text,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/transform/frontmatter.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/transform/frontmatter.ts src/lib/transform/frontmatter.test.ts
git commit -m "feat: split and normalize frontmatter"
```

---

### Task 5: Excalidraw 그림 추출

**Files:**
- Create: `src/lib/transform/excalidraw.ts`
- Test: `src/lib/transform/excalidraw.test.ts`

**Interfaces:**
- Produces:
  - `type ExcalidrawScene = { type?: string; version?: number; source?: string; elements: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }`
  - `type ExtractFailure = "no-drawing-block" | "too-large" | "decompress-failed" | "invalid-json" | "invalid-scene"`
  - `type ExtractResult = { ok: true; scene: ExcalidrawScene } | { ok: false; reason: ExtractFailure }`
  - `extractExcalidraw(raw: string): ExtractResult` — `## Drawing` 아래의 ` ```compressed-json `(LZ-String base64, **여러 줄로 나뉘어 있고 CRLF일 수 있다**) 또는 ` ```json ` 블록을 읽는다. 압축 문자열이 1,000만 자를 넘으면 풀지 않고 `too-large`. 예외를 던지지 않는다.

테스트의 장면은 코드에서 직접 압축해서 만든다(실제 그림 파일을 저장소에 복사하지 않는다). 실제 파일은 Task 11에서 눈으로 확인한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/transform/excalidraw.test.ts`**

`````ts
import LZString from "lz-string";
import { describe, expect, it } from "vitest";
import { extractExcalidraw } from "./excalidraw";

const scene = {
  type: "excalidraw",
  version: 2,
  source: "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.27.3",
  elements: [
    { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
    { id: "b", type: "text", x: 10, y: 10, text: "프론트엔드 흐름" },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

/** 플러그인처럼 압축 문자열을 256자씩 여러 줄로 나눠 넣은 문서를 만든다. */
function pluginDoc(newline = "\n"): string {
  const compressed = LZString.compressToBase64(JSON.stringify(scene));
  const lines = compressed.match(/.{1,256}/g)!.join(newline);
  return [
    "---",
    "",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "",
    "---",
    "==⚠  Switch to EXCALIDRAW VIEW ⚠==",
    "",
    "",
    "# Excalidraw Data",
    "",
    "## Text Elements",
    "프론트엔드 흐름 ^abc",
    "",
    "%%",
    "## Drawing",
    "```compressed-json",
    lines,
    "```",
    "%%",
  ].join(newline);
}

describe("extractExcalidraw", () => {
  it("여러 줄로 나뉜 compressed-json을 풀어 장면을 돌려준다", () => {
    const result = extractExcalidraw(pluginDoc());
    expect(result).toEqual({ ok: true, scene });
  });

  it("CRLF 줄바꿈이어도 풀린다", () => {
    expect(extractExcalidraw(pluginDoc("\r\n"))).toEqual({ ok: true, scene });
  });

  it("평문 json 블록도 읽는다", () => {
    const raw = `## Drawing\n\`\`\`json\n${JSON.stringify(scene)}\n\`\`\`\n`;
    expect(extractExcalidraw(raw)).toEqual({ ok: true, scene });
  });

  it("Drawing 블록이 없으면 no-drawing-block", () => {
    expect(extractExcalidraw("# 그냥 문서")).toEqual({ ok: false, reason: "no-drawing-block" });
    expect(extractExcalidraw("## Drawing\n내용만 있음")).toEqual({
      ok: false,
      reason: "no-drawing-block",
    });
  });

  it("압축 데이터가 깨져 있으면 decompress-failed", () => {
    const raw = "## Drawing\n```compressed-json\n!!!not-base64!!!\n```\n";
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "decompress-failed" });
  });

  it("json이 깨져 있으면 invalid-json", () => {
    const raw = "## Drawing\n```json\n{ broken\n```\n";
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("장면 모양이 아니면 invalid-scene", () => {
    const raw = "## Drawing\n```json\n{\"hello\": 1}\n```\n";
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "invalid-scene" });
    expect(extractExcalidraw("## Drawing\n```json\n[1,2]\n```\n")).toEqual({
      ok: false,
      reason: "invalid-scene",
    });
  });

  it("압축 문자열이 너무 크면 풀지 않고 too-large", () => {
    const raw = `## Drawing\n\`\`\`compressed-json\n${"A".repeat(10_000_001)}\n\`\`\`\n`;
    expect(extractExcalidraw(raw)).toEqual({ ok: false, reason: "too-large" });
  });

  it("빈 문서도 예외 없이 실패로 돌려준다", () => {
    expect(extractExcalidraw("")).toEqual({ ok: false, reason: "no-drawing-block" });
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/transform/excalidraw.test.ts`
Expected: FAIL — `./excalidraw`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/transform/excalidraw.ts`**

`````ts
import LZString from "lz-string";

export type ExcalidrawScene = {
  type?: string;
  version?: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type ExtractFailure =
  | "no-drawing-block"
  | "too-large"
  | "decompress-failed"
  | "invalid-json"
  | "invalid-scene";

export type ExtractResult =
  | { ok: true; scene: ExcalidrawScene }
  | { ok: false; reason: ExtractFailure };

/** 압축 문자열 상한(문자 수). 악의적으로 큰 파일이 서버 메모리를 쓰지 못하게 막는다. */
const MAX_COMPRESSED_CHARS = 10_000_000;

const FENCE_RE = /```(compressed-json|json)[ \t]*\r?\n([\s\S]*?)\r?\n```/;

function isScene(value: unknown): value is ExcalidrawScene {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { elements?: unknown }).elements)
  );
}

/** Obsidian Excalidraw 플러그인 문서(`.excalidraw.md`)에서 그림 장면 JSON을 꺼낸다. */
export function extractExcalidraw(raw: string): ExtractResult {
  const start = raw.indexOf("## Drawing");
  if (start === -1) return { ok: false, reason: "no-drawing-block" };

  const match = FENCE_RE.exec(raw.slice(start));
  if (!match) return { ok: false, reason: "no-drawing-block" };

  const [, kind, body] = match;
  let json: string | null;
  if (kind === "compressed-json") {
    // 플러그인은 압축 문자열을 여러 줄로 나눠 저장하므로 공백과 개행을 모두 지운다.
    const compressed = body.replace(/\s+/g, "");
    if (compressed.length > MAX_COMPRESSED_CHARS) return { ok: false, reason: "too-large" };
    try {
      json = LZString.decompressFromBase64(compressed);
    } catch {
      json = null;
    }
    if (!json) return { ok: false, reason: "decompress-failed" };
  } else {
    json = body;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  return isScene(parsed) ? { ok: true, scene: parsed } : { ok: false, reason: "invalid-scene" };
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/transform/excalidraw.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/transform/excalidraw.ts src/lib/transform/excalidraw.test.ts
git commit -m "feat: extract Excalidraw scene from Obsidian plugin files"
```

---

### Task 6: Markdown 변환 파이프라인 (링크, 위키링크, 보안)

**Files:**
- Create: `src/lib/transform/paths.ts`, `repo-urls.ts`, `link-index.ts`, `nodes.ts`, `links.ts`, `wikilinks.ts`, `markdown.ts`, `fixtures.ts`
- Test: `src/lib/transform/markdown.test.ts`, `links.test.ts`, `wikilinks.test.ts`

**Interfaces:**
- Consumes: Task 3의 `TreeEntry`, `isMarkdownPath`, `isUnderPaths`, `isDrawingPath`, `docUrl`, `encodeDocPath`
- Produces:
  - `paths.ts`: `dirname`, `basename`, `nameWithoutMd`, `displayName(path)`(`.excalidraw.md`와 `.md`를 뗀 이름), `resolveRepoPath(baseDir, target): string | null`(루트 밖으로 나가면 `null`)
  - `repo-urls.ts`: `type RepoRef = { owner; name; branch }`, `rawUrl(repo, path)`, `blobUrl(repo, path)`, `treeUrl(repo, path)`
  - `link-index.ts`: `type LinkIndex = { docs; docPaths; assets; allPaths; dirs }`, `buildLinkIndex(entries: TreeEntry[], docsPaths: string[]): LinkIndex`
  - `nodes.ts`: `missingNode(children)` — `span.wikilink-missing` 노드
  - `links.ts`: `type LinkContext = { currentPath: string; index: LinkIndex; repo: RepoRef }`, `rewriteUrl(url, isImage, ctx): string`, `remarkRewriteLinks(ctx)`
  - `wikilinks.ts`: `type WikilinkCollector = { embeds: string[]; missing: string[] }`, `resolveWikilink(target, currentPath, index)`, `remarkWikilinks(options)`
  - `markdown.ts`: `type MarkdownContext = LinkContext`, `type Heading = { depth: number; text: string; id: string }`, `type MarkdownResult = { tree: HastRoot; headings: Heading[]; embeds: string[]; missing: string[] }`, `renderMarkdown(body: string, ctx: MarkdownContext): Promise<MarkdownResult>`, `toHtml(tree: HastRoot): string`(테스트·디버깅용)

동작 규칙(테스트가 모두 고정한다):
- 원본 HTML은 버리고 결과를 `rehype-sanitize`로 한 번 더 거른다. 허용 목록에 `span.wikilink-missing`과 `div[data-excalidraw]`만 더한다. `clobberPrefix`는 비운다(각주 id가 이미 `user-content-`를 갖고 있어서, 두 번 붙으면 각주 링크가 깨진다).
- 상대 링크: 표시 대상 문서 → `/docs/...`, 그 밖의 파일 → GitHub blob 주소, 폴더 → GitHub tree 주소, 이미지 → 원본 파일 주소. 풀 수 없는 상대 링크는 링크를 걷어내고 "없는 문서" 표시로 바꾼다(그렇지 않으면 우리 사이트의 없는 경로로 이어진다).
- 위키링크: `[[이름]]`, `[[이름|별칭]]`, `[[이름#제목]]`, `[[#제목]]`. 대소문자와 `.md`를 무시하고, 경로 일부(`sub/Note B`)도 찾고, 같은 이름이 여럿이면 현재 문서와 같은 폴더를 먼저 고른다. 표시 대상 폴더 밖 문서는 "없는 문서"다. 코드와 기존 링크 안은 건드리지 않는다.
- 한 줄짜리 `![[그림.excalidraw]]`는 `<div data-excalidraw="경로">` 블록이 되고 `embeds`에 기록된다. 문장 속 그림 임베드는 링크가 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

세 테스트 파일이 함께 쓰는 가짜 저장소부터 만든다.

**`src/lib/transform/fixtures.ts`**

`````ts
import type { TreeEntry } from "../github/tree";
import { buildLinkIndex } from "./link-index";
import { renderMarkdown, toHtml, type MarkdownContext } from "./markdown";

/** Markdown 변환 테스트가 함께 쓰는 가짜 저장소. 표시 대상 문서 폴더는 `d`다. */
export const repo = { owner: "org", name: "repo", branch: "develop" };

export const entries: TreeEntry[] = [
  "d/index.md",
  "d/Note A.md",
  "d/sub/Note B.md",
  "d/other/Note B.md",
  "d/diagram.excalidraw.md",
  "d/img/pic.png",
  "d/guide.pdf",
  "outside/secret.md",
  "src/App.tsx",
].map((path) => ({ path, sha: `sha-${path}` }));

export function ctx(currentPath = "d/index.md"): MarkdownContext {
  return { currentPath, index: buildLinkIndex(entries, ["d"]), repo };
}

export async function html(md: string, currentPath?: string): Promise<string> {
  return toHtml((await renderMarkdown(md, ctx(currentPath))).tree);
}
`````

**`src/lib/transform/markdown.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { ctx, html } from "./fixtures";
import { renderMarkdown, toHtml } from "./markdown";

describe("기본 Markdown", () => {
  it("GFM 표, 작업 목록, 취소선, 코드 블록 언어를 유지한다", async () => {
    const out = await html(
      ["| a | b |", "|---|---|", "| 1 | 2 |", "", "- [x] 끝", "- [ ] 남음", "", "~~x~~", "", "```ts", "const a = 1;", "```"].join("\n"),
    );
    expect(out).toContain("<table>");
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("<del>x</del>");
    expect(out).toContain('class="language-ts"');
  });

  it("제목에 id를 붙이고 목록을 만든다(중복은 번호가 붙는다)", async () => {
    const { headings, tree } = await renderMarkdown("# 제목\n## 소제목\n## 소제목\n##### 무시", ctx());
    expect(headings).toEqual([
      { depth: 1, text: "제목", id: "제목" },
      { depth: 2, text: "소제목", id: "소제목" },
      { depth: 2, text: "소제목", id: "소제목-1" },
    ]);
    expect(toHtml(tree)).toContain('<h2 id="소제목-1">');
  });

  it("각주 링크가 서로 맞는다", async () => {
    const out = await html("글[^1]\n\n[^1]: 각주");
    const hrefs = [...out.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    for (const target of hrefs) expect(out).toContain(`id="${target}"`);
    expect(hrefs.length).toBeGreaterThan(0);
  });

  it("빈 문서도 문제없다", async () => {
    expect(await html("")).toBe("");
  });

  it("큰 문서(약 1MB)도 오류 없이 변환한다", async () => {
    const big = Array.from({ length: 20_000 }, (_, i) => `## 제목 ${i}\n\n문단 ${i} [[Note A]] \`code\`\n`).join("\n");
    const { headings } = await renderMarkdown(big, ctx());
    expect(headings).toHaveLength(20_000);
  });
});

describe("보안", () => {
  it("스크립트, 이벤트 핸들러, javascript: 주소를 모두 없앤다", async () => {
    const out = await html(
      [
        "<script>alert(1)</script>",
        "",
        '<img src=x onerror="alert(2)">',
        "",
        "[클릭](javascript:alert(3))",
        "",
        "![img](javascript:alert(4))",
        "",
        '<a href="javascript:alert(5)" onclick="alert(6)">raw</a>',
        "",
        '<iframe src="https://evil.example"></iframe>',
        "",
        '<div style="position:fixed">x</div>',
      ].join("\n"),
    );
    expect(out).not.toMatch(/<script|<iframe|onerror|onclick|javascript:|style=/i);
    expect(out).not.toContain("alert(1)");
  });

  it("data: 주소의 이미지는 허용하지 않는다", async () => {
    const out = await html("![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)");
    expect(out).not.toContain("data:");
  });

  it("위키링크 라벨에 든 HTML도 글자로만 나온다", async () => {
    const out = await html("[[<script>alert(1)</script>]]");
    expect(out).not.toContain("<script");
  });

  it("사용자가 만든 data-excalidraw 속성은 위키링크 밖에서는 남지 않는다", async () => {
    const out = await html('<div data-excalidraw="d/diagram.excalidraw.md"></div>');
    expect(out).not.toContain("data-excalidraw");
  });
});
`````

**`src/lib/transform/links.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { html } from "./fixtures";

describe("상대 링크와 이미지", () => {
  it("표시 대상 문서로 가는 상대 링크는 사이트 안 주소가 되고 앵커를 유지한다", async () => {
    const out = await html("[a](Note%20A.md#섹션) [b](./sub/Note%20B.md)");
    // 한글 앵커는 주소에서 퍼센트 인코딩되어 나오고, 브라우저가 디코딩해서 id와 맞춘다.
    expect(out).toContain('href="/docs/d/Note%20A.md#%EC%84%B9%EC%85%98"');
    expect(out).toContain('href="/docs/d/sub/Note%20B.md"');
  });

  it("문서 폴더 밖 문서와 다른 파일은 GitHub 주소로 연결한다", async () => {
    const out = await html("[s](../outside/secret.md) [f](../src/App.tsx) [d](sub)");
    expect(out).toContain('href="https://github.com/org/repo/blob/develop/outside/secret.md"');
    expect(out).toContain('href="https://github.com/org/repo/blob/develop/src/App.tsx"');
    expect(out).toContain('href="https://github.com/org/repo/tree/develop/d/sub"');
  });

  it("상대 이미지는 원본 파일 주소가 된다", async () => {
    const out = await html("![그림](img/pic.png)");
    expect(out).toContain('src="https://raw.githubusercontent.com/org/repo/develop/d/img/pic.png"');
  });

  it("외부 주소, 앵커, mailto는 그대로다", async () => {
    const out = await html("[a](https://example.com) [b](#top) [c](mailto:x@y.z)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('href="#top"');
    expect(out).toContain('href="mailto:x@y.z"');
  });

  it("참조 방식 링크의 정의도 고쳐 쓴다", async () => {
    const out = await html("[a][ref]\n\n[ref]: ./Note%20A.md");
    expect(out).toContain('href="/docs/d/Note%20A.md"');
  });

  it("저장소 밖을 가리키는 상대 링크(../..)는 링크가 아니라 없는 문서 표시가 된다", async () => {
    const out = await html("[x](../../../../etc/passwd)");
    expect(out).not.toContain("href=");
    expect(out).toContain('<span class="wikilink-missing" title="없는 문서">x</span>');
  });

  it("잘못된 % 인코딩이 있어도 죽지 않는다", async () => {
    await expect(html("[x](%E0%A4%A.md)")).resolves.toContain("wikilink-missing");
  });

  it("저장소에서 찾지 못한 상대 링크는 우리 사이트의 없는 경로로 이어지지 않게 링크를 걷어낸다", async () => {
    const out = await html("[폰트](/src/shared/fonts/a.woff2) [문서](./nope.md)");
    expect(out).not.toContain("href=");
    expect(out.match(/wikilink-missing/g)).toHaveLength(2);
  });

  it("찾지 못한 상대 이미지는 대체 글자만 남기고, 안쪽에 든 이미지도 처리한다", async () => {
    expect(await html("![로고](./nope.png)")).toContain(">로고</span>");
    const out = await html("[![뱃지](img/pic.png)](./nope.md)");
    expect(out).toContain('src="https://raw.githubusercontent.com/org/repo/develop/d/img/pic.png"');
    expect(out).not.toContain('href="./nope.md"');
  });
});
`````

**`src/lib/transform/wikilinks.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { ctx, html } from "./fixtures";
import { renderMarkdown, toHtml } from "./markdown";

describe("위키링크", () => {
  it("이름으로 문서를 찾아 링크한다(대소문자와 .md는 무시)", async () => {
    const out = await html("[[Note A]] [[note a]] [[Note A.md]]");
    expect(out.match(/href="\/docs\/d\/Note%20A\.md"/g)).toHaveLength(3);
  });

  it("별칭과 제목 앵커를 처리한다", async () => {
    const out = await html("[[Note A|보여줄 이름]] [[Note A#Some Heading]]");
    expect(out).toContain('<a href="/docs/d/Note%20A.md">보여줄 이름</a>');
    expect(out).toContain('<a href="/docs/d/Note%20A.md#some-heading">Note A › Some Heading</a>');
  });

  it("[[#제목]]은 현재 문서 안의 앵커다", async () => {
    expect(await html("[[#Some Heading]]")).toContain('<a href="#some-heading">');
  });

  it("경로 일부를 적으면 그 경로의 문서를 찾는다", async () => {
    expect(await html("[[sub/Note B]]")).toContain('href="/docs/d/sub/Note%20B.md"');
  });

  it("같은 이름이 여럿이면 현재 문서와 같은 폴더를 먼저, 없으면 경로순 첫 번째를 고른다", async () => {
    expect(await html("[[Note B]]", "d/sub/x.md")).toContain('href="/docs/d/sub/Note%20B.md"');
    expect(await html("[[Note B]]", "d/other/x.md")).toContain('href="/docs/d/other/Note%20B.md"');
    expect(await html("[[Note B]]", "d/index.md")).toContain('href="/docs/d/other/Note%20B.md"');
  });

  it("대상을 못 찾으면 없는 문서 표시로 남기고 기록한다(문서 폴더 밖 문서도 없는 문서다)", async () => {
    const { tree, missing } = await renderMarkdown("[[없는 문서]] 그리고 [[outside/secret]]", ctx());
    const out = toHtml(tree);
    expect(out).toContain('<span class="wikilink-missing" title="없는 문서">없는 문서</span>');
    expect(missing).toEqual(["없는 문서", "outside/secret"]);
  });

  it("코드 안의 위키링크는 건드리지 않는다", async () => {
    const out = await html("`[[Note A]]`\n\n```\n[[Note A]]\n```");
    expect(out).not.toContain("<a");
  });

  it("이미 링크 안에 있는 위키링크는 중첩하지 않는다", async () => {
    const out = await html("[보기 [[Note A]]](https://example.com)");
    expect(out.match(/<a /g)).toHaveLength(1);
  });

  it("이미지 임베드는 원본 파일 주소의 이미지가 된다", async () => {
    const out = await html("![[pic.png]] ![[pic.png|설명]] ![[pic.png|300]]");
    expect(
      out.match(/src="https:\/\/raw\.githubusercontent\.com\/org\/repo\/develop\/d\/img\/pic\.png"/g),
    ).toHaveLength(3);
    expect(out).toContain('alt="설명"');
    expect(out).toContain('alt="pic.png"');
  });

  it("이미지가 아닌 첨부는 GitHub 링크가 된다", async () => {
    expect(await html("[[guide.pdf]]")).toContain('href="https://github.com/org/repo/blob/develop/d/guide.pdf"');
  });

  it("한 줄짜리 그림 임베드는 p 밖의 그림 블록이 된다", async () => {
    const { tree, embeds } = await renderMarkdown("앞\n\n![[diagram.excalidraw]]\n\n뒤", ctx());
    expect(toHtml(tree)).toBe('<p>앞</p>\n<div data-excalidraw="d/diagram.excalidraw.md"></div>\n<p>뒤</p>');
    expect(embeds).toEqual(["d/diagram.excalidraw.md"]);
  });

  it("문장 속 그림 임베드는 링크로 대신한다", async () => {
    const { tree, embeds } = await renderMarkdown("보세요 ![[diagram.excalidraw]] 입니다", ctx());
    expect(toHtml(tree)).toContain('<a href="/docs/d/diagram.excalidraw.md">diagram.excalidraw</a>');
    expect(embeds).toEqual([]);
  });

  it("없는 그림 임베드는 없는 문서 표시가 된다", async () => {
    const { tree, missing } = await renderMarkdown("![[nope.excalidraw]]", ctx());
    expect(toHtml(tree)).toContain("wikilink-missing");
    expect(missing).toEqual(["nope.excalidraw"]);
  });

  it("이상한 입력에도 죽지 않는다", async () => {
    const weird = [
      "[[]]", "[[ ]]", "[[|]]", "[[a|]]", "[[#]]", "[[a", "a]]", "[[[Note A]]]",
      "![[]]", "[[\\]]", "[[Note A#^block]]", "[[ ../../etc/passwd ]]", "[[/Note A]]",
    ].join("\n\n");
    const out = await html(weird);
    expect(typeof out).toBe("string");
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/transform/markdown.test.ts src/lib/transform/links.test.ts src/lib/transform/wikilinks.test.ts`
Expected: FAIL — `./link-index` 또는 `./markdown`을 찾을 수 없다는 오류.

- [ ] **Step 3: 경로 도우미와 색인을 구현한다**

**`src/lib/transform/paths.ts`**

`````ts
export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** 문서 이름(확장자 없이): `a/b.md` → `b`, `a/c.excalidraw.md` → `c.excalidraw` */
export function nameWithoutMd(path: string): string {
  return basename(path).replace(/\.md$/i, "");
}

/** 화면에 보일 이름: `.excalidraw.md`와 `.md`를 뗀다. */
export function displayName(path: string): string {
  return basename(path).replace(/\.excalidraw\.md$/i, "").replace(/\.md$/i, "");
}

/**
 * baseDir 기준 상대 경로를 저장소 루트 기준 경로로 바꾼다.
 * `/`로 시작하면 저장소 루트 기준이다. 루트 밖으로 나가면 null.
 */
export function resolveRepoPath(baseDir: string, target: string): string | null {
  const parts = target.startsWith("/") || !baseDir ? [] : baseDir.split("/");
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}
`````

**`src/lib/transform/repo-urls.ts`**

`````ts
import { encodeDocPath } from "../github/tree";

export type RepoRef = { owner: string; name: string; branch: string };

/** 브라우저가 직접 받을 수 있는 원본 파일 주소(공개 저장소 전용). */
export function rawUrl(repo: RepoRef, path: string): string {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${encodeDocPath(repo.branch)}/${encodeDocPath(path)}`;
}

export function blobUrl(repo: RepoRef, path: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/blob/${encodeDocPath(repo.branch)}/${encodeDocPath(path)}`;
}

export function treeUrl(repo: RepoRef, path: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/tree/${encodeDocPath(repo.branch)}/${encodeDocPath(path)}`;
}
`````

**`src/lib/transform/link-index.ts`**

`````ts
import { isMarkdownPath, isUnderPaths, type TreeEntry } from "../github/tree";
import { basename, nameWithoutMd } from "./paths";

export type LinkIndex = {
  /** 소문자 문서 이름(확장자 없이) → 경로 목록. 표시 대상 문서 폴더 안의 .md만 든다. */
  docs: Map<string, string[]>;
  docPaths: Set<string>;
  /** 소문자 파일 이름 → 경로 목록. 저장소 전체의 .md가 아닌 파일. */
  assets: Map<string, string[]>;
  allPaths: Set<string>;
  dirs: Set<string>;
};

function add(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 위키링크와 상대 링크를 풀기 위해, 트리 전체에서 이름으로 찾을 수 있는 색인을 만든다. */
export function buildLinkIndex(entries: TreeEntry[], docsPaths: string[]): LinkIndex {
  const index: LinkIndex = {
    docs: new Map(),
    docPaths: new Set(),
    assets: new Map(),
    allPaths: new Set(),
    dirs: new Set(),
  };

  for (const { path } of entries) {
    index.allPaths.add(path);
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      index.dirs.add(segments.slice(0, i).join("/"));
    }
    if (isMarkdownPath(path)) {
      if (isUnderPaths(path, docsPaths)) {
        index.docPaths.add(path);
        add(index.docs, nameWithoutMd(path).toLowerCase(), path);
      }
    } else {
      add(index.assets, basename(path).toLowerCase(), path);
    }
  }

  for (const map of [index.docs, index.assets]) {
    for (const list of map.values()) list.sort();
  }
  return index;
}
`````

**`src/lib/transform/nodes.ts`**

`````ts
import type { PhrasingContent } from "mdast";

/** 풀 수 없는 링크나 위키링크를 표시하는 span.wikilink-missing 노드 */
export function missingNode(children: PhrasingContent[]): PhrasingContent {
  return {
    type: "wikilinkMissing",
    data: { hName: "span", hProperties: { className: ["wikilink-missing"], title: "없는 문서" } },
    children,
  } as unknown as PhrasingContent;
}
`````

- [ ] **Step 4: 링크 다시 쓰기와 위키링크를 구현한다**

**`src/lib/transform/links.ts`**

`````ts
import type { Parent, PhrasingContent, Root } from "mdast";
import { visit } from "unist-util-visit";
import { docUrl } from "../github/tree";
import type { LinkIndex } from "./link-index";
import { missingNode } from "./nodes";
import { dirname, resolveRepoPath } from "./paths";
import { blobUrl, rawUrl, treeUrl, type RepoRef } from "./repo-urls";

export type LinkContext = {
  /** 지금 렌더링하는 문서의 저장소 경로 */
  currentPath: string;
  index: LinkIndex;
  repo: RepoRef;
};

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * 문서 안의 상대 주소를 화면에서 열 수 있는 주소로 바꾼다.
 * - 이미지 → 원본 파일 주소
 * - 표시 대상 문서(.md) → 사이트 안의 문서 주소
 * - 그 밖의 파일과 폴더 → GitHub 화면 주소
 * 절대 주소와 `#앵커`는 그대로 두고, 저장소에서 찾지 못한 상대 주소도 그대로 돌려준다.
 */
export function rewriteUrl(url: string, isImage: boolean, ctx: LinkContext): string {
  if (!url || url.startsWith("#") || url.startsWith("//") || SCHEME_RE.test(url)) return url;

  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt + 1);
  let pathPart = (hashAt === -1 ? url : url.slice(0, hashAt)).split("?")[0];
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch {
    // 잘못된 % 인코딩은 원문 그대로 쓴다.
  }

  const resolved = resolveRepoPath(dirname(ctx.currentPath), pathPart);
  if (resolved === null) return url;

  const { index, repo } = ctx;
  if (isImage) return index.allPaths.has(resolved) ? rawUrl(repo, resolved) : url;
  if (index.docPaths.has(resolved)) return docUrl(resolved) + (hash ? `#${hash}` : "");
  if (index.allPaths.has(resolved)) return blobUrl(repo, resolved);
  if (index.dirs.has(resolved)) return treeUrl(repo, resolved);
  return url;
}

/** 다시 쓴 뒤에도 남아 있는 상대 주소: 우리 사이트의 없는 경로를 가리키게 되므로 링크로 두면 안 된다. */
function isUnresolved(url: string): boolean {
  if (!url || url.startsWith("#") || url.startsWith("//") || SCHEME_RE.test(url)) return false;
  return !url.startsWith("/docs/");
}

export function remarkRewriteLinks(ctx: LinkContext) {
  return (tree: Root): void => {
    visit(tree, (node, index, parent) => {
      if (node.type === "definition") {
        node.url = rewriteUrl(node.url, false, ctx);
        return;
      }
      if (node.type !== "link" && node.type !== "image") return;

      const url = rewriteUrl(node.url, node.type === "image", ctx);
      if (isUnresolved(url) && parent && index !== undefined) {
        const children: PhrasingContent[] =
          node.type === "link" ? node.children : [{ type: "text", value: node.alt || node.url }];
        (parent as Parent).children.splice(index, 1, missingNode(children));
        return index; // 새로 넣은 노드의 안쪽(중첩된 이미지 등)도 계속 처리한다.
      }
      node.url = url;
    });
  };
}
`````

**`src/lib/transform/wikilinks.ts`**

`````ts
import GithubSlugger from "github-slugger";
import type { Image, Link, Paragraph, Parent, PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import { docUrl, isDrawingPath, isMarkdownPath } from "../github/tree";
import type { LinkIndex } from "./link-index";
import type { LinkContext } from "./links";
import { missingNode } from "./nodes";
import { dirname } from "./paths";
import { blobUrl, rawUrl } from "./repo-urls";

export type WikilinkCollector = {
  /** 문서 안에 그대로 그려야 하는 Excalidraw 그림의 저장소 경로 */
  embeds: string[];
  /** 대상을 찾지 못한 위키링크 */
  missing: string[];
};

export type WikilinkOptions = LinkContext & { collector: WikilinkCollector };

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
const WHOLE_EMBED_RE = /^!\[\[([^[\]\r\n]+?)\]\]$/;

type Resolved =
  | { kind: "doc" | "drawing" | "asset"; path: string }
  | { kind: "self" }
  | { kind: "missing" };

function parseInner(inner: string): { label: string; target: string; heading: string; alias: string } {
  const pipe = inner.indexOf("|");
  const left = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
  const hash = left.indexOf("#");
  const target = (hash === -1 ? left : left.slice(0, hash)).trim();
  let heading = hash === -1 ? "" : left.slice(hash + 1).trim();
  if (heading.startsWith("^")) heading = ""; // 블록 참조는 문서 연결까지만 지원한다.
  const label = alias || (heading ? `${target} › ${heading}` : target);
  return { label, target, heading, alias };
}

/** 같은 폴더의 후보를 먼저, 없으면 경로순 첫 번째를 고른다. */
function pickNearest(candidates: string[], currentPath: string): string | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort();
  const here = dirname(currentPath);
  return sorted.find((path) => dirname(path) === here) ?? sorted[0];
}

export function resolveWikilink(target: string, currentPath: string, index: LinkIndex): Resolved {
  const cleaned = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned) return { kind: "self" };

  const docKey = cleaned.replace(/\.md$/i, "").toLowerCase();
  const docCandidates = docKey.includes("/")
    ? [...index.docPaths].filter((path) => {
        const normalized = path.replace(/\.md$/i, "").toLowerCase();
        return normalized === docKey || normalized.endsWith(`/${docKey}`);
      })
    : (index.docs.get(docKey) ?? []);
  const doc = pickNearest(docCandidates, currentPath);
  if (doc) return { kind: isDrawingPath(doc) ? "drawing" : "doc", path: doc };

  const fileKey = cleaned.toLowerCase();
  const assetCandidates = fileKey.includes("/")
    ? [...index.allPaths].filter((path) => {
        if (isMarkdownPath(path)) return false;
        const normalized = path.toLowerCase();
        return normalized === fileKey || normalized.endsWith(`/${fileKey}`);
      })
    : (index.assets.get(fileKey) ?? []);
  const asset = pickNearest(assetCandidates, currentPath);
  return asset ? { kind: "asset", path: asset } : { kind: "missing" };
}

function text(value: string): Text {
  return { type: "text", value };
}

function link(url: string, label: string): Link {
  return { type: "link", url, title: null, children: [text(label)] };
}

function missing(label: string): PhrasingContent {
  return missingNode([text(label)]);
}

function embedNode(path: string): Paragraph {
  return {
    type: "excalidrawEmbed",
    data: { hName: "div", hProperties: { dataExcalidraw: path } },
    children: [],
  } as unknown as Paragraph;
}

function anchor(heading: string): string {
  return heading ? `#${new GithubSlugger().slug(heading)}` : "";
}

function convert(isEmbed: boolean, inner: string, options: WikilinkOptions): PhrasingContent[] {
  const { label, target, heading, alias } = parseInner(inner);
  const resolved = resolveWikilink(target, options.currentPath, options.index);

  switch (resolved.kind) {
    case "self":
      return heading ? [link(anchor(heading), label)] : [missing(label || inner)];
    case "doc":
    case "drawing":
      return [link(docUrl(resolved.path) + anchor(heading), label)];
    case "asset": {
      if (isEmbed && IMAGE_EXT_RE.test(resolved.path)) {
        const alt = alias && !/^\d+(x\d+)?$/.test(alias) ? alias : target;
        const image: Image = { type: "image", url: rawUrl(options.repo, resolved.path), alt, title: null };
        return [image];
      }
      return [link(blobUrl(options.repo, resolved.path), label)];
    }
    case "missing":
      options.collector.missing.push(target || inner);
      return [missing(label || inner)];
  }
}

function splitText(value: string, options: WikilinkOptions): PhrasingContent[] | null {
  const pattern = /(!?)\[\[([^[\]\r\n]+?)\]\]/g;
  const out: PhrasingContent[] = [];
  let last = 0;
  let matched = false;
  for (const match of value.matchAll(pattern)) {
    matched = true;
    const start = match.index ?? 0;
    if (start > last) out.push(text(value.slice(last, start)));
    out.push(...convert(match[1] === "!", match[2], options));
    last = start + match[0].length;
  }
  if (!matched) return null;
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
}

/** Obsidian 위키링크(`[[ ]]`, `![[ ]]`)를 일반 링크, 이미지, 그림 자리표시로 바꾼다. */
export function remarkWikilinks(options: WikilinkOptions) {
  return (tree: Root): void => {
    // 1) 한 줄이 `![[그림.excalidraw]]` 하나뿐이면 문단을 그림 블록으로 바꾼다.
    visit(tree, "paragraph", (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (node.children.length !== 1 || node.children[0].type !== "text") return;
      const match = WHOLE_EMBED_RE.exec(node.children[0].value.trim());
      if (!match) return;
      const { target } = parseInner(match[1]);
      const resolved = resolveWikilink(target, options.currentPath, options.index);
      if (resolved.kind !== "drawing") return;
      options.collector.embeds.push(resolved.path);
      (parent as Parent).children.splice(index, 1, embedNode(resolved.path));
      return [SKIP, index + 1];
    });

    // 2) 나머지 텍스트 속 위키링크. 코드와 기존 링크 안은 건드리지 않는다.
    visit(tree, "text", (node, index, parent) => {
      if (index === undefined || !parent) return;
      if (parent.type === "link" || parent.type === "linkReference") return;
      const replaced = splitText(node.value, options);
      if (!replaced) return;
      (parent as Parent).children.splice(index, 1, ...replaced);
      return [SKIP, index + replaced.length];
    });
  };
}
`````

- [ ] **Step 5: 파이프라인을 구현한다**

**`src/lib/transform/markdown.ts`**

`````ts
import type { Element, Root as HastRoot } from "hast";
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { remarkRewriteLinks, type LinkContext } from "./links";
import { remarkWikilinks, type WikilinkCollector } from "./wikilinks";

export type MarkdownContext = LinkContext;

export type Heading = { depth: number; text: string; id: string };

export type MarkdownResult = {
  tree: HastRoot;
  /** h1~h4 (문서 순서) */
  headings: Heading[];
  embeds: string[];
  missing: string[];
};

/**
 * 기본 허용 목록에 우리가 만드는 두 가지만 더한다.
 * - 없는 위키링크 표시용 span.wikilink-missing
 * - Excalidraw 자리표시용 div[data-excalidraw]
 * 원본 HTML은 remark-rehype 단계에서 이미 버려지고, 여기서 한 번 더 걸러진다.
 * clobberPrefix를 비우는 이유: 각주의 id는 remark-rehype가 이미 `user-content-`를 붙이므로,
 * sanitize가 또 붙이면 각주 링크와 대상 id가 어긋난다.
 */
const SANITIZE_SCHEMA: SanitizeOptions = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "wikilink-missing"]],
    div: [...(defaultSchema.attributes?.div ?? []), "dataExcalidraw"],
  },
};

function textOf(node: Element | HastRoot): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else if (child.type === "element") out += textOf(child);
  }
  return out;
}

export async function renderMarkdown(body: string, ctx: MarkdownContext): Promise<MarkdownResult> {
  const collector: WikilinkCollector = { embeds: [], missing: [] };
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRewriteLinks, ctx)
    .use(remarkWikilinks, { ...ctx, collector })
    .use(remarkRehype)
    .use(rehypeSanitize, SANITIZE_SCHEMA)
    .use(rehypeSlug);

  const tree = (await processor.run(processor.parse(body))) as HastRoot;

  const headings: Heading[] = [];
  visit(tree, "element", (node) => {
    const match = /^h([1-4])$/.exec(node.tagName);
    const id = node.properties?.id;
    if (match && typeof id === "string") {
      headings.push({ depth: Number(match[1]), text: textOf(node).trim(), id });
    }
  });

  return { tree, headings, embeds: collector.embeds, missing: collector.missing };
}

/** 테스트와 디버깅용. 화면에서는 hast를 React 요소로 바꿔 쓴다. */
export function toHtml(tree: HastRoot): string {
  return unified().use(rehypeStringify).stringify(tree);
}
`````

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run src/lib/transform/markdown.test.ts src/lib/transform/links.test.ts src/lib/transform/wikilinks.test.ts`
Expected: PASS (32 tests: markdown 9, links 9, wikilinks 14). 큰 문서 테스트(약 1MB) 때문에 몇 초 걸릴 수 있다.

- [ ] **Step 7: 커밋한다**

```bash
git add src/lib/transform
git commit -m "feat: add markdown pipeline with wikilinks, link rewriting, and sanitizing"
```

---

### Task 7: 문서 하나를 화면용 데이터로 (parseDocument)

**Files:**
- Create: `src/lib/transform/index.ts`
- Test: `src/lib/transform/index.test.ts`

**Interfaces:**
- Consumes: Task 4의 `splitFrontmatter`, `Frontmatter`, Task 6의 `renderMarkdown`, `Heading`, `MarkdownContext`, `displayName`
- Produces:
  - `type ParsedDocument = { title: string; hasH1: boolean; frontmatter: Frontmatter; frontmatterError?: string; tree: HastRoot; toc: Heading[]; embeds: string[]; missing: string[] }`
  - `parseDocument(raw: string, ctx: MarkdownContext): Promise<ParsedDocument>` — 제목은 frontmatter `title` → 첫 h1 → 파일 이름 순. `toc`는 h2~h4. `.excalidraw.md`에는 쓰지 않는다.
  - `titleFromPath` (= `displayName`의 재내보내기)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/transform/index.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { buildLinkIndex } from "./link-index";
import { parseDocument } from "./index";
import { toHtml } from "./markdown";

const repo = { owner: "org", name: "repo", branch: "develop" };
const entries = ["d/a.md", "d/b.md", "d/fig.excalidraw.md"].map((path) => ({ path, sha: path }));
const base = (currentPath: string) => ({ currentPath, index: buildLinkIndex(entries, ["d"]), repo });

describe("parseDocument", () => {
  it("frontmatter 제목이 있으면 그것을 쓴다", async () => {
    const doc = await parseDocument("---\ntitle: 앞머리 제목\ntags: [x]\n---\n# 본문 제목\n## 소제목", base("d/a.md"));
    expect(doc.title).toBe("앞머리 제목");
    expect(doc.frontmatter.tags).toEqual(["x"]);
    expect(doc.hasH1).toBe(true);
    expect(doc.toc.map((h) => h.text)).toEqual(["소제목"]);
  });

  it("frontmatter 제목이 없으면 첫 h1, 그것도 없으면 파일 이름을 쓴다", async () => {
    expect((await parseDocument("# 첫 제목\n내용", base("d/a.md"))).title).toBe("첫 제목");
    const noHeading = await parseDocument("내용만", base("d/a.md"));
    expect(noHeading.title).toBe("a");
    expect(noHeading.hasH1).toBe(false);
  });

  it("frontmatter가 깨져 있어도 문서는 그려지고 오류가 남는다", async () => {
    const doc = await parseDocument("---\ntitle: [깨짐\n---\n# 살아있음", base("d/a.md"));
    expect(doc.frontmatterError).toBeTruthy();
    expect(doc.title).toBe("살아있음");
  });

  it("그림 임베드와 없는 링크를 모아 돌려준다", async () => {
    const doc = await parseDocument("![[fig.excalidraw]]\n\n[[b]] [[없음]]", base("d/a.md"));
    expect(doc.embeds).toEqual(["d/fig.excalidraw.md"]);
    expect(doc.missing).toEqual(["없음"]);
    expect(toHtml(doc.tree)).toContain('href="/docs/d/b.md"');
  });

  it("BOM과 빈 문서를 견딘다", async () => {
    expect((await parseDocument("﻿# BOM", base("d/a.md"))).title).toBe("BOM");
    const empty = await parseDocument("", base("d/a.md"));
    expect(empty.title).toBe("a");
    expect(toHtml(empty.tree)).toBe("");
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/transform/index.test.ts`
Expected: FAIL — `parseDocument`가 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/transform/index.ts`**

`````ts
import type { Root as HastRoot } from "hast";
import { splitFrontmatter, type Frontmatter } from "./frontmatter";
import { renderMarkdown, type Heading, type MarkdownContext } from "./markdown";
import { displayName } from "./paths";

export type ParsedDocument = {
  title: string;
  /** 본문에 h1이 있으면 true. 화면에서 제목을 중복해서 그리지 않는 데 쓴다. */
  hasH1: boolean;
  frontmatter: Frontmatter;
  /** frontmatter를 읽지 못했을 때의 이유 */
  frontmatterError?: string;
  tree: HastRoot;
  /** h2~h4 */
  toc: Heading[];
  /** 문서 안에 그려야 하는 Excalidraw 그림의 저장소 경로 */
  embeds: string[];
  /** 대상을 찾지 못한 위키링크 */
  missing: string[];
};

/** 일반 Markdown 문서 하나를 화면용 데이터로 바꾼다. (`.excalidraw.md`는 이 함수를 쓰지 않는다.) */
export async function parseDocument(raw: string, ctx: MarkdownContext): Promise<ParsedDocument> {
  const { frontmatter, body, error } = splitFrontmatter(raw);
  const { tree, headings, embeds, missing } = await renderMarkdown(body, ctx);
  const h1 = headings.find((heading) => heading.depth === 1);

  return {
    title: frontmatter.title ?? (h1?.text || displayName(ctx.currentPath)),
    hasH1: Boolean(h1),
    frontmatter,
    frontmatterError: error,
    tree,
    toc: headings.filter((heading) => heading.depth >= 2),
    embeds,
    missing,
  };
}

export { displayName as titleFromPath } from "./paths";
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/transform/index.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/transform/index.ts src/lib/transform/index.test.ts
git commit -m "feat: add parseDocument combining frontmatter and markdown"
```

---

### Task 8: GitHub 클라이언트

**Files:**
- Create: `src/lib/github/tags.ts`, `src/lib/github/client.ts`
- Test: `src/lib/github/client.test.ts`

**Interfaces:**
- Consumes: Task 3의 `TreeEntry`
- Produces:
  - `tags.ts`: `TREE_TAG = "tree"`, `TREE_REVALIDATE_SECONDS = 600`
  - `client.ts`:
    - `class GitHubError extends Error { status: number }`, `class RateLimitError extends GitHubError { resetAt: Date | undefined }`
    - `type RepoConfig = { owner; name; branch }`, `type LatestCommit = { sha: string; committedAt: string }`
    - `type GitHubClient = { getTree(): Promise<TreeEntry[]>; getBlobText(sha: string): Promise<string>; getLatestCommit(): Promise<LatestCommit> }`
    - `createGitHubClient({ repo, token?, fetchImpl? }): GitHubClient`
    - `type Loaded<T> = { value: T; stale: boolean }`, `withStaleFallback<T>(load: () => Promise<T>): () => Promise<Loaded<T>>` — 실패하면 마지막으로 성공한 값을 `stale: true`로 돌려주고, 처음부터 실패하면 오류를 그대로 던진다.

동작 규칙: 트리와 최신 커밋은 `fetch`에 `next: { revalidate: 600, tags: ["tree"] }`를 붙인다. blob은 주소에 SHA가 들어 있어 응답이 바뀌지 않으므로 `cache: "force-cache"`이고, `Accept: application/vnd.github.raw+json`으로 원문을 바로 받는다(실제 저장소에서 확인함). 한도 초과(남은 호출 0인 403, 또는 `retry-after`가 붙은 403/429)는 `RateLimitError`, 그 밖의 실패는 `GitHubError`다. 트리가 잘려서 오면(`truncated`) 오류다. 알아둘 점: Next.js 데이터 캐시는 항목 하나가 2MB를 넘으면 저장하지 못하는 것으로 알고 있다(이 세션에서 문서로 확인하지는 않았다). 지금 저장소의 트리(875개 항목)와 가장 큰 문서는 이보다 훨씬 작다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/github/client.test.ts`**

`````ts
import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubError, RateLimitError, withStaleFallback } from "./client";

const repo = { owner: "org", name: "repo", branch: "develop" };

function respond(body: unknown, init: ResponseInit = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status: 200, ...init });
}

function clientWith(fetchImpl: typeof fetch, token?: string) {
  return createGitHubClient({ repo, token, fetchImpl });
}

describe("getTree", () => {
  it("blob만 골라 경로와 SHA를 돌려주고, 트리 태그와 만료 시간을 fetch에 붙인다", async () => {
    const fetchImpl = vi.fn(async () =>
      respond({
        truncated: false,
        tree: [
          { path: "a", type: "tree", sha: "t1" },
          { path: "a/b.md", type: "blob", sha: "s1", size: 12 },
          { path: "c.png", type: "blob", sha: "s2" },
        ],
      }),
    );
    const entries = await clientWith(fetchImpl as unknown as typeof fetch).getTree();

    expect(entries).toEqual([
      { path: "a/b.md", sha: "s1", size: 12 },
      { path: "c.png", sha: "s2", size: undefined },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { next?: unknown }];
    expect(url).toBe("https://api.github.com/repos/org/repo/git/trees/develop?recursive=1");
    expect(init.next).toEqual({ revalidate: 600, tags: ["tree"] });
  });

  it("토큰이 있으면 Authorization을, 없으면 넣지 않는다", async () => {
    const withToken = vi.fn(async () => respond({ tree: [] }));
    await clientWith(withToken as unknown as typeof fetch, "tok").getTree();
    expect((withToken.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: "Bearer tok",
      "User-Agent": "docs-backoffice",
    });

    const without = vi.fn(async () => respond({ tree: [] }));
    await clientWith(without as unknown as typeof fetch).getTree();
    expect((without.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("Authorization");
  });

  it("트리가 잘려서 오면 오류로 알린다", async () => {
    const fetchImpl = vi.fn(async () => respond({ truncated: true, tree: [] }));
    await expect(clientWith(fetchImpl as unknown as typeof fetch).getTree()).rejects.toThrow(GitHubError);
  });
});

describe("getBlobText", () => {
  it("원문을 받고 영구 캐시 옵션을 쓴다", async () => {
    const fetchImpl = vi.fn(async () => respond("# 원문\n한글"));
    const text = await clientWith(fetchImpl as unknown as typeof fetch).getBlobText("abc123");

    expect(text).toBe("# 원문\n한글");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/org/repo/git/blobs/abc123");
    expect(init.cache).toBe("force-cache");
    expect(init.headers).toMatchObject({ Accept: "application/vnd.github.raw+json" });
  });
});

describe("getLatestCommit", () => {
  it("SHA와 커밋 시각을 돌려준다", async () => {
    const fetchImpl = vi.fn(async () =>
      respond({ sha: "deadbeef", commit: { committer: { date: "2026-09-29T13:41:31Z" } } }),
    );
    expect(await clientWith(fetchImpl as unknown as typeof fetch).getLatestCommit()).toEqual({
      sha: "deadbeef",
      committedAt: "2026-09-29T13:41:31Z",
    });
  });
});

describe("오류 처리", () => {
  it("남은 호출이 0인 403은 RateLimitError이고 초기화 시각을 담는다", async () => {
    const fetchImpl = vi.fn(async () =>
      respond({}, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" } }),
    );
    const error = await clientWith(fetchImpl as unknown as typeof fetch)
      .getTree()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).resetAt?.getTime()).toBe(1790000000 * 1000);
  });

  it("retry-after가 붙은 429(보조 한도)도 RateLimitError다", async () => {
    const fetchImpl = vi.fn(async () => respond({}, { status: 429, headers: { "retry-after": "30" } }));
    await expect(clientWith(fetchImpl as unknown as typeof fetch).getTree()).rejects.toBeInstanceOf(RateLimitError);
  });

  it("한도와 무관한 403이나 404는 GitHubError이고 상태 코드를 담는다", async () => {
    const forbidden = vi.fn(async () => respond({}, { status: 403 }));
    const error = await clientWith(forbidden as unknown as typeof fetch)
      .getTree()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).not.toBeInstanceOf(RateLimitError);

    const missing = vi.fn(async () => respond({}, { status: 404 }));
    expect(
      await clientWith(missing as unknown as typeof fetch)
        .getBlobText("x")
        .catch((e: unknown) => (e as GitHubError).status),
    ).toBe(404);
  });
});

describe("withStaleFallback", () => {
  it("성공하면 새 값을, 이후 실패하면 마지막 성공 값을 stale로 돌려준다", async () => {
    let calls = 0;
    const load = withStaleFallback(async () => {
      calls += 1;
      if (calls === 2) throw new Error("boom");
      return `v${calls}`;
    });
    expect(await load()).toEqual({ value: "v1", stale: false });
    expect(await load()).toEqual({ value: "v1", stale: true });
    expect(await load()).toEqual({ value: "v3", stale: false });
  });

  it("처음부터 실패하면 오류를 그대로 던진다", async () => {
    const load = withStaleFallback(async () => {
      throw new Error("처음부터 실패");
    });
    await expect(load()).rejects.toThrow("처음부터 실패");
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/github/client.test.ts`
Expected: FAIL — `./client`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/github/tags.ts`**

`````ts
/** 파일 트리와 최신 커밋 조회에 붙이는 캐시 태그. push webhook이 이 태그를 무효화한다. */
export const TREE_TAG = "tree";

/** 트리 캐시의 안전장치 만료 시간(초). webhook을 놓쳐도 이 시간이 지나면 갱신된다. */
export const TREE_REVALIDATE_SECONDS = 600;
`````

**`src/lib/github/client.ts`**

`````ts
import { TREE_REVALIDATE_SECONDS, TREE_TAG } from "./tags";
import type { TreeEntry } from "./tree";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export class RateLimitError extends GitHubError {
  constructor(readonly resetAt: Date | undefined) {
    super("GitHub API 호출 한도를 넘었어요.", 429);
    this.name = "RateLimitError";
  }
}

export type RepoConfig = { owner: string; name: string; branch: string };
export type LatestCommit = { sha: string; committedAt: string };

export type GitHubClient = {
  getTree(): Promise<TreeEntry[]>;
  getBlobText(sha: string): Promise<string>;
  getLatestCommit(): Promise<LatestCommit>;
};

export type GitHubClientOptions = {
  repo: RepoConfig;
  token?: string;
  fetchImpl?: typeof fetch;
};

const API = "https://api.github.com";

type TreeResponse = {
  truncated?: boolean;
  tree: { path: string; type: string; sha: string; size?: number }[];
};

type CommitResponse = { sha: string; commit: { committer: { date: string } } };

export function createGitHubClient({ repo, token, fetchImpl = fetch }: GitHubClientOptions): GitHubClient {
  const base = `${API}/repos/${repo.owner}/${repo.name}`;

  function headers(accept: string): Record<string, string> {
    return {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "docs-backoffice",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function request(url: string, accept: string, init: RequestInit): Promise<Response> {
    const response = await fetchImpl(url, { ...init, headers: headers(accept) });
    if (response.ok) return response;

    const limited =
      (response.status === 403 || response.status === 429) &&
      (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"));
    if (limited) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      throw new RateLimitError(reset > 0 ? new Date(reset * 1000) : undefined);
    }
    throw new GitHubError(`GitHub API ${response.status}: ${url}`, response.status);
  }

  const treeCache = { next: { revalidate: TREE_REVALIDATE_SECONDS, tags: [TREE_TAG] } };

  return {
    async getTree() {
      const url = `${base}/git/trees/${repo.branch}?recursive=1`;
      const response = await request(url, "application/vnd.github+json", treeCache);
      const data = (await response.json()) as TreeResponse;
      if (data.truncated) throw new GitHubError("저장소 트리가 너무 커서 일부만 왔어요.", 200);
      return data.tree
        .filter((item) => item.type === "blob")
        .map((item) => ({ path: item.path, sha: item.sha, size: item.size }));
    },

    async getBlobText(sha) {
      // 주소에 내용 해시(sha)가 들어 있어서 응답은 바뀌지 않는다. 영구 캐시한다.
      const response = await request(`${base}/git/blobs/${sha}`, "application/vnd.github.raw+json", {
        cache: "force-cache",
      });
      return response.text();
    },

    async getLatestCommit() {
      const url = `${base}/commits/${repo.branch}`;
      const response = await request(url, "application/vnd.github+json", treeCache);
      const data = (await response.json()) as CommitResponse;
      return { sha: data.sha, committedAt: data.commit.committer.date };
    },
  };
}

export type Loaded<T> = { value: T; stale: boolean };

/**
 * 불러오기에 실패하면 마지막으로 성공한 값을 대신 돌려준다(stale: true).
 * 서버리스 인스턴스 메모리에만 남는 최선 노력 방식이라, 새 인스턴스에서 처음 실패하면 오류가 그대로 난다.
 */
export function withStaleFallback<T>(load: () => Promise<T>): () => Promise<Loaded<T>> {
  let lastGood: { value: T } | undefined;
  return async () => {
    try {
      const value = await load();
      lastGood = { value };
      return { value, stale: false };
    } catch (error) {
      if (lastGood) return { value: lastGood.value, stale: true };
      throw error;
    }
  };
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/github/client.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/github/tags.ts src/lib/github/client.ts src/lib/github/client.test.ts
git commit -m "feat: add GitHub client with cache tags and stale fallback"
```

---

### Task 9: Webhook (서명 검증, 이벤트 판단, 엔드포인트)

**Files:**
- Create: `src/lib/webhook/verify.ts`, `src/lib/webhook/decide.ts`, `src/app/api/github-webhook/route.ts`
- Test: `src/lib/webhook/webhook.test.ts`, `src/app/api/github-webhook/route.test.ts`

**Interfaces:**
- Consumes: Task 2의 `loadConfig`, `AppConfig`, Task 3의 `isMarkdownPath`, `isUnderPaths`, Task 8의 `TREE_TAG`
- Produces:
  - `verifySignature(rawBody: string, header: string | null, secret: string): boolean` — `sha256=<hex>`를 timing-safe로 비교. 비밀키가 비면 항상 `false`.
  - `type WebhookDecision = { kind: "ignore"; reason: string } | { kind: "pong" } | { kind: "push"; commitSha: string | null; changedDocs: string[] }`
  - `decideWebhook(event: string | null, payload: unknown, cfg: { branch: string; docsPaths: string[] }): WebhookDecision` — `ping` → `pong`, push가 아니거나 다른 브랜치이거나 브랜치 삭제이거나 본문 모양이 이상하면 `ignore`, 표시 브랜치의 push면 `push`. `changedDocs`는 문서 폴더 안에서 추가·수정·삭제된 `.md`(중복 없이, 정렬). 모양이 이상한 `commits`에도 죽지 않는다.
  - `POST /api/github-webhook` — 응답: 설정 오류·비밀키 없음 500, 서명 틀림 401, JSON 아님 400, `ping` 200 `{pong:true}`, 무시 202, 표시 브랜치 push 200 `{revalidated:true, changedDocs:n}`(이때만 `revalidateTag("tree", { expire: 0 })`).

계획 2에서 이 라우트에 알림 발송이 붙는다. 서명 검증은 파싱 전에 원본 문자열로 해야 한다(서명은 원본 본문 기준이다).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/webhook/webhook.test.ts`**

`````ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decideWebhook } from "./decide";
import { verifySignature } from "./verify";

const sign = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  const body = '{"ref":"refs/heads/develop","메모":"한글"}';

  it("올바른 서명은 통과한다(한글 본문 포함)", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("본문이나 비밀키가 다르면 실패한다", () => {
    expect(verifySignature(`${body} `, sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
  });

  it("헤더가 없거나 형식이 틀리거나 길이가 다르면 실패한다", () => {
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha1=abcdef", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=zzzz", "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=abcd", "s3cret")).toBe(false);
  });

  it("비밀키가 비어 있으면 어떤 서명도 통과시키지 않는다", () => {
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
  });
});

describe("decideWebhook", () => {
  const cfg = { branch: "develop", docsPaths: ["frontend/docs/plan"] };
  const push = (extra: Record<string, unknown> = {}) => ({
    ref: "refs/heads/develop",
    after: "abc123",
    commits: [
      { added: ["frontend/docs/plan/a.md"], modified: ["frontend/src/x.ts"], removed: [] },
      { added: [], modified: ["frontend/docs/plan/a.md", "frontend/docs/plan/b.md"], removed: ["frontend/docs/plan/old.md"] },
    ],
    ...extra,
  });

  it("ping은 pong이다", () => {
    expect(decideWebhook("ping", {}, cfg)).toEqual({ kind: "pong" });
  });

  it("push 이외의 이벤트는 무시한다", () => {
    expect(decideWebhook("issues", push(), cfg).kind).toBe("ignore");
    expect(decideWebhook(null, push(), cfg).kind).toBe("ignore");
  });

  it("표시 브랜치의 push는 바뀐 문서(중복 없이, 폴더 안의 .md만)를 모아 돌려준다", () => {
    expect(decideWebhook("push", push(), cfg)).toEqual({
      kind: "push",
      commitSha: "abc123",
      changedDocs: ["frontend/docs/plan/a.md", "frontend/docs/plan/b.md", "frontend/docs/plan/old.md"],
    });
  });

  it("다른 브랜치의 push와 브랜치 삭제는 무시한다", () => {
    expect(decideWebhook("push", push({ ref: "refs/heads/feature/x" }), cfg).kind).toBe("ignore");
    expect(decideWebhook("push", push({ deleted: true }), cfg).kind).toBe("ignore");
    expect(decideWebhook("push", push({ ref: "refs/tags/v1" }), cfg).kind).toBe("ignore");
  });

  it("문서가 안 바뀐 push도 push로 판단하고 changedDocs만 비운다", () => {
    const decision = decideWebhook("push", push({ commits: [{ added: [], modified: ["frontend/src/x.ts"], removed: [] }] }), cfg);
    expect(decision).toEqual({ kind: "push", commitSha: "abc123", changedDocs: [] });
  });

  it("모양이 이상한 본문에도 죽지 않는다", () => {
    for (const payload of [null, undefined, "text", 42, [], {}]) {
      expect(decideWebhook("push", payload, cfg).kind).toBe("ignore");
    }
    const odd = decideWebhook(
      "push",
      { ref: "refs/heads/develop", after: 5, commits: [null, "x", { added: "nope", modified: [1, null, "frontend/docs/plan/z.md"] }] },
      cfg,
    );
    expect(odd).toEqual({ kind: "push", commitSha: null, changedDocs: ["frontend/docs/plan/z.md"] });
    expect(decideWebhook("push", { ref: "refs/heads/develop", commits: "nope" }, cfg)).toEqual({
      kind: "push",
      commitSha: null,
      changedDocs: [],
    });
  });

  it("문서 폴더 목록이 비어 있으면 모든 .md 변경을 문서로 본다", () => {
    const decision = decideWebhook(
      "push",
      { ref: "refs/heads/develop", commits: [{ modified: ["README.md", "a.ts"] }] },
      { branch: "develop", docsPaths: [] },
    );
    expect(decision).toMatchObject({ changedDocs: ["README.md"] });
  });
});
`````

**`src/app/api/github-webhook/route.test.ts`**

`````ts
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const { POST } = await import("./route");

const SECRET = "test-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function webhook(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/github-webhook", {
    method: "POST",
    body,
    headers: { "x-github-event": "push", "x-hub-signature-256": sign(body), ...headers },
  });
}

const pushBody = (ref = "refs/heads/develop") =>
  JSON.stringify({ ref, after: "abc", commits: [{ modified: ["frontend/docs/plan/a.md"] }] });

beforeEach(() => {
  revalidateTag.mockClear();
  vi.stubEnv("GITHUB_REPO", "org/repo");
  vi.stubEnv("GITHUB_BRANCH", "develop");
  vi.stubEnv("DOCS_PATHS", "frontend/docs/plan");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/github-webhook", () => {
  it("서명이 맞는 develop push는 트리 캐시를 즉시 만료시킨다", async () => {
    const response = await POST(webhook(pushBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: true, changedDocs: 1 });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("tree", { expire: 0 });
  });

  it("서명이 틀리거나 없으면 401이고 캐시를 건드리지 않는다", async () => {
    const wrong = await POST(webhook(pushBody(), { "x-hub-signature-256": "sha256=" + "0".repeat(64) }));
    expect(wrong.status).toBe(401);
    const request = new Request("https://example.com/api/github-webhook", {
      method: "POST",
      body: pushBody(),
      headers: { "x-github-event": "push" },
    });
    expect((await POST(request)).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("ping은 200이고 캐시를 건드리지 않는다", async () => {
    const response = await POST(webhook("{}", { "x-github-event": "ping", "x-hub-signature-256": sign("{}") }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("다른 브랜치의 push는 202로 무시한다", async () => {
    const response = await POST(webhook(pushBody("refs/heads/feature/x")));
    expect(response.status).toBe(202);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("서명은 맞지만 JSON이 아닌 본문(폼 방식 webhook)은 400으로 안내한다", async () => {
    const body = "payload=%7B%22ref%22%3A%22refs%2Fheads%2Fdevelop%22%7D";
    const response = await POST(webhook(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("application/json");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("JSON이지만 모양이 이상하면 죽지 않고 무시한다", async () => {
    for (const body of ["null", "[]", '"text"', "42"]) {
      const response = await POST(webhook(body));
      expect(response.status).toBe(202);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("비밀키가 설정되지 않았으면 500이다(서명이 맞아 보여도 처리하지 않는다)", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect((await POST(webhook(pushBody()))).status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("저장소 설정이 없으면 500이다", async () => {
    vi.stubEnv("GITHUB_REPO", "");
    expect((await POST(webhook(pushBody()))).status).toBe(500);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/webhook src/app/api`
Expected: FAIL — `./verify` 또는 `./route`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/webhook/verify.ts`**

`````ts
import { createHmac, timingSafeEqual } from "node:crypto";

/** GitHub의 `X-Hub-Signature-256`("sha256=<hex>") 값이 원본 본문과 비밀키로 계산한 값과 같은지 확인한다. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
`````

**`src/lib/webhook/decide.ts`**

`````ts
import { isMarkdownPath, isUnderPaths } from "../github/tree";

export type WebhookDecision =
  | { kind: "ignore"; reason: string }
  | { kind: "pong" }
  | {
      kind: "push";
      /** push 뒤의 커밋 SHA (알림 중복 방지 키로 쓴다) */
      commitSha: string | null;
      /** 표시 대상 문서 폴더 아래에서 바뀐(추가·수정·삭제된) .md 경로 */
      changedDocs: string[];
    };

type DecideConfig = { branch: string; docsPaths: string[] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectChangedDocs(commits: unknown, cfg: DecideConfig): string[] {
  const changed = new Set<string>();
  if (!Array.isArray(commits)) return [];
  for (const commit of commits) {
    const record = asRecord(commit);
    if (!record) continue;
    for (const key of ["added", "modified", "removed"] as const) {
      const paths = record[key];
      if (!Array.isArray(paths)) continue;
      for (const path of paths) {
        if (typeof path === "string" && isMarkdownPath(path) && isUnderPaths(path, cfg.docsPaths)) {
          changed.add(path);
        }
      }
    }
  }
  return [...changed].sort();
}

/** GitHub webhook 이벤트를 보고 무엇을 할지 결정한다. 부수 효과는 없다. */
export function decideWebhook(event: string | null, payload: unknown, cfg: DecideConfig): WebhookDecision {
  if (event === "ping") return { kind: "pong" };
  if (event !== "push") return { kind: "ignore", reason: "push 이벤트가 아니에요" };

  const body = asRecord(payload);
  if (!body) return { kind: "ignore", reason: "본문 모양이 이상해요" };
  if (body.ref !== `refs/heads/${cfg.branch}`) return { kind: "ignore", reason: "다른 브랜치예요" };
  if (body.deleted === true) return { kind: "ignore", reason: "브랜치가 삭제됐어요" };

  return {
    kind: "push",
    commitSha: typeof body.after === "string" ? body.after : null,
    changedDocs: collectChangedDocs(body.commits, cfg),
  };
}
`````

**`src/app/api/github-webhook/route.ts`**

`````ts
import { revalidateTag } from "next/cache";
import { loadConfig, type AppConfig } from "@/lib/config";
import { TREE_TAG } from "@/lib/github/tags";
import { decideWebhook } from "@/lib/webhook/decide";
import { verifySignature } from "@/lib/webhook/verify";

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch {
    return json({ error: "서버 설정이 올바르지 않아요." }, 500);
  }
  // 비밀키가 없으면 누구의 요청도 믿을 수 없으므로 처리하지 않는다.
  if (!config.webhookSecret) return json({ error: "webhook 비밀키가 설정되지 않았어요." }, 500);

  // 서명은 원본 본문 기준으로 계산되므로 파싱하기 전에 문자열로 받아 검증한다.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), config.webhookSecret)) {
    return json({ error: "서명이 올바르지 않아요." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "본문이 JSON이 아니에요. webhook의 Content type을 application/json으로 설정하세요." }, 400);
  }

  const decision = decideWebhook(request.headers.get("x-github-event"), payload, config);
  switch (decision.kind) {
    case "pong":
      return json({ pong: true }, 200);
    case "ignore":
      return json({ ignored: decision.reason }, 202);
    case "push":
      // 외부 서비스가 부르는 경로라 updateTag는 쓸 수 없다. { expire: 0 }으로 즉시 만료시킨다.
      revalidateTag(TREE_TAG, { expire: 0 });
      return json({ revalidated: true, changedDocs: decision.changedDocs.length }, 200);
  }
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/webhook src/app/api`
Expected: PASS (19 tests: webhook 11, route 8)

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/webhook src/app/api
git commit -m "feat: add GitHub webhook endpoint with signature check and tree invalidation"
```

---

### Task 10: 화면 (서버 로더, 컴포넌트, 페이지)

**Files:**
- Create: `src/lib/relative-time.ts`, `src/lib/github/index.ts`, `src/lib/docs.ts`
- Create: `src/components/{DocTree,Toc,StaleBanner,RelativeTime,MarkdownView,DrawingBlock,ExcalidrawView}.tsx`
- Create: `src/app/docs/[...path]/page.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Delete: `src/app/page.module.css` (create-next-app이 만든 기본 파일)
- Test: `src/lib/relative-time.test.ts`

**Interfaces:**
- Consumes: Task 2 `loadConfig`, Task 3 `buildTreeGroups`·`findDocEntry`·`pathFromSegments`·`docUrl`·`isDrawingPath`, Task 5 `extractExcalidraw`·`ExcalidrawScene`·`ExtractResult`, Task 6 `buildLinkIndex`·`Heading`·`blobUrl`·`displayName`, Task 7 `parseDocument`·`ParsedDocument`, Task 8 `createGitHubClient`·`withStaleFallback`·`Loaded`·`LatestCommit`
- Produces:
  - `formatRelative(iso: string, now?: Date): string` — "방금 전", "N분 전", "N시간 전", "N일 전", 30일이 넘으면 `YYYY-MM-DD`
  - `getTree(): Promise<Loaded<TreeEntry[]>>`, `getBlobText(sha)`, `getLatestCommitOrNull()` (`lib/github/index.ts`, 서버 전용)
  - `loadDocPage(path: string): Promise<DocPage | null>`, `loadDrawing(...)`, `type DrawingResult`, `type DocPage` (`lib/docs.ts`, 서버 전용)

이 작업의 화면 코드는 브라우저가 있어야 확인할 수 있어서 단위 테스트는 `formatRelative`만 있다. 나머지는 타입 검사, 린트, 프로덕션 빌드, Task 11의 실제 요청으로 확인한다. 화면 설계는 스펙 6.1, 6.2, 7을 따른다.

- [ ] **Step 1: `formatRelative`의 실패하는 테스트를 쓴다**

**`src/lib/relative-time.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { formatRelative } from "./relative-time";

const now = new Date("2026-09-30T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it("1분 미만은 방금 전", () => {
    expect(formatRelative(ago(10 * SEC), now)).toBe("방금 전");
    expect(formatRelative(ago(44 * SEC), now)).toBe("방금 전");
  });

  it("분, 시간, 일 단위로 말한다", () => {
    expect(formatRelative(ago(90 * SEC), now)).toBe("2분 전");
    expect(formatRelative(ago(10 * MIN), now)).toBe("10분 전");
    expect(formatRelative(ago(59.6 * MIN), now)).toBe("1시간 전");
    expect(formatRelative(ago(5 * HOUR), now)).toBe("5시간 전");
    expect(formatRelative(ago(23.7 * HOUR), now)).toBe("1일 전");
    expect(formatRelative(ago(3 * DAY), now)).toBe("3일 전");
  });

  it("30일이 넘으면 날짜로 보여준다", () => {
    expect(formatRelative("2026-08-01T00:00:00Z", now)).toBe("2026-08-01");
  });

  it("미래 시각이나 잘못된 값도 죽지 않는다", () => {
    expect(formatRelative("2026-09-30T13:00:00Z", now)).toBe("방금 전");
    expect(formatRelative("not-a-date", now)).toBe("not-a-date");
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/relative-time.test.ts`
Expected: FAIL — `./relative-time`을 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/relative-time.ts`**

`````ts
/** "방금 전", "5분 전", "3시간 전", "2일 전", 30일이 넘으면 날짜(UTC 기준 YYYY-MM-DD) */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return "방금 전"; // 시계가 어긋나 미래로 보이는 경우도 여기에 든다.
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(then).toISOString().slice(0, 10);
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/relative-time.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 서버 로더를 만든다**

`server-only`를 import하는 이유: 토큰이 든 클라이언트가 실수로 브라우저 번들에 들어가면 빌드가 실패하게 한다. `loadDocPage`를 `cache`로 감싼 이유: `generateMetadata`와 페이지가 같은 요청 안에서 함께 불러도 한 번만 실행된다.

**`src/lib/github/index.ts`**

`````ts
import "server-only";
import { loadConfig } from "@/lib/config";
import {
  createGitHubClient,
  withStaleFallback,
  type GitHubClient,
  type LatestCommit,
  type Loaded,
} from "./client";
import type { TreeEntry } from "./tree";

let client: GitHubClient | undefined;

/** 설정(환경변수)으로 만든 GitHub 클라이언트. 서버에서만 쓴다(토큰이 들어 있다). */
export function getGitHubClient(): GitHubClient {
  if (!client) {
    const config = loadConfig();
    client = createGitHubClient({
      repo: { ...config.repo, branch: config.branch },
      token: config.githubToken,
    });
  }
  return client;
}

/** 파일 트리. 불러오기에 실패하면 마지막 성공 값을 stale로 돌려준다. */
export const getTree: () => Promise<Loaded<TreeEntry[]>> = withStaleFallback(() =>
  getGitHubClient().getTree(),
);

export function getBlobText(sha: string): Promise<string> {
  return getGitHubClient().getBlobText(sha);
}

/** 최신 커밋 정보. 화면의 부가 정보라서 실패해도 문서 보기를 막지 않는다. */
export async function getLatestCommitOrNull(): Promise<LatestCommit | null> {
  try {
    return await getGitHubClient().getLatestCommit();
  } catch {
    return null;
  }
}
`````

**`src/lib/docs.ts`**

`````ts
import "server-only";
import { cache } from "react";
import { loadConfig } from "@/lib/config";
import { getBlobText, getTree } from "@/lib/github";
import { findDocEntry, isDrawingPath, type TreeEntry } from "@/lib/github/tree";
import { parseDocument, type ParsedDocument } from "@/lib/transform";
import { extractExcalidraw, type ExtractResult } from "@/lib/transform/excalidraw";
import { buildLinkIndex } from "@/lib/transform/link-index";
import { displayName } from "@/lib/transform/paths";
import { blobUrl } from "@/lib/transform/repo-urls";

export type DrawingResult = ExtractResult | { ok: false; reason: "not-found" };

export type DocPage =
  | {
      kind: "markdown";
      path: string;
      title: string;
      stale: boolean;
      sourceUrl: string;
      doc: ParsedDocument;
      /** 문서 안에 임베드된 그림(저장소 경로 → 결과) */
      drawings: Record<string, DrawingResult>;
    }
  | {
      kind: "drawing";
      path: string;
      title: string;
      stale: boolean;
      sourceUrl: string;
      result: DrawingResult;
    };

export async function loadDrawing(
  entries: TreeEntry[],
  docsPaths: string[],
  path: string,
): Promise<DrawingResult> {
  const entry = findDocEntry(entries, docsPaths, path);
  if (!entry || !isDrawingPath(path)) return { ok: false, reason: "not-found" };
  return extractExcalidraw(await getBlobText(entry.sha));
}

/**
 * 문서 상세 화면에 필요한 모든 데이터를 불러온다. 문서가 없으면 null.
 * 같은 요청 안에서 generateMetadata와 페이지가 함께 불러도 한 번만 실행되도록 cache로 감쌌다.
 */
export const loadDocPage = cache(async (path: string): Promise<DocPage | null> => {
  const config = loadConfig();
  const { value: entries, stale } = await getTree();
  const entry = findDocEntry(entries, config.docsPaths, path);
  if (!entry) return null;

  const repo = { ...config.repo, branch: config.branch };
  const sourceUrl = blobUrl(repo, path);
  const raw = await getBlobText(entry.sha);

  if (isDrawingPath(path)) {
    return {
      kind: "drawing",
      path,
      title: displayName(path),
      stale,
      sourceUrl,
      result: extractExcalidraw(raw),
    };
  }

  const doc = await parseDocument(raw, {
    currentPath: path,
    index: buildLinkIndex(entries, config.docsPaths),
    repo,
  });
  const embedPaths = [...new Set(doc.embeds)];
  const drawings = Object.fromEntries(
    await Promise.all(
      embedPaths.map(async (embedPath) => [
        embedPath,
        await loadDrawing(entries, config.docsPaths, embedPath),
      ]),
    ),
  );
  return { kind: "markdown", path, title: doc.title, stale, sourceUrl, doc, drawings };
});
`````

- [ ] **Step 6: 컴포넌트를 만든다**

`ExcalidrawView`에서 두 가지를 조심했다. (1) 플러그인이 저장한 `appState` 전체를 넘기면 `collaborators`가 `Map`이 아니라서 깨지므로 배경색만 넘긴다. (2) 화면에 맞추는 `scrollToContent`는 Excalidraw가 마운트되기 전에 부르면 경고가 나므로, API를 상태에 담아 두었다가 다음 프레임에 부른다.

`MarkdownView`는 `hast-util-to-jsx-runtime`이 모든 요소에 넘기는 `node` 속성을 DOM에 흘리지 않도록 빼고, `div[data-excalidraw]`를 그림 블록으로 바꾼다. 외부 링크는 새 탭으로 열고, 이미지는 지연 로딩한다.

**`src/components/DocTree.tsx`**

`````tsx
import type { TreeNode } from "@/lib/github/tree";

function Nodes({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul className="tree">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={node.path}>
            <details>
              <summary>{node.name}</summary>
              <Nodes nodes={node.children} />
            </details>
          </li>
        ) : (
          <li key={node.path}>
            <a href={node.url}>{node.kind === "drawing" ? `🎨 ${node.name}` : node.name}</a>
          </li>
        ),
      )}
    </ul>
  );
}

export function DocTree({ nodes }: { nodes: TreeNode[] }) {
  return <Nodes nodes={nodes} />;
}
`````

**`src/components/Toc.tsx`**

`````tsx
import type { Heading } from "@/lib/transform/markdown";

export function Toc({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;
  return (
    <nav className="toc" aria-label="목차">
      <strong>목차</strong>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingLeft: `${(heading.depth - 2) * 0.9}rem` }}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
`````

**`src/components/StaleBanner.tsx`**

`````tsx
export function StaleBanner() {
  return (
    <p className="banner" role="status">
      최신 내용을 불러오지 못했어요. 마지막으로 불러온 내용을 보여드려요.
    </p>
  );
}
`````

**`src/components/RelativeTime.tsx`**

`````tsx
"use client";

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/relative-time";

/**
 * "N분 전"은 페이지가 캐시된 시점이 아니라 보는 시점 기준이어야 하므로 브라우저에서 계산한다.
 * 서버와 브라우저의 첫 렌더링 결과가 같도록, 처음에는 UTC 날짜만 보여준다.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 10));

  useEffect(() => {
    const update = () => setText(formatRelative(iso));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time dateTime={iso} title={iso}>
      {text}
    </time>
  );
}
`````

**`src/components/ExcalidrawView.tsx`**

`````tsx
"use client";

import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ExcalidrawScene } from "@/lib/transform/excalidraw";

// Excalidraw는 브라우저 전용이라 서버에서는 그리지 않고, 필요할 때 동적으로 불러온다.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <p className="drawing-loading">그림을 불러오는 중…</p>,
});

type Props = { scene: ExcalidrawScene; height?: string };

/** 읽기 전용 Excalidraw 뷰어. 컨테이너에 높이가 있어야 그려진다. */
export function ExcalidrawView({ scene, height = "70vh" }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const background =
    typeof scene.appState?.viewBackgroundColor === "string" ? scene.appState.viewBackgroundColor : "#ffffff";

  // 큰 그림도 처음에는 화면 안에 다 들어오도록 맞춘다. 이후 확대·이동은 사용자가 한다.
  // API 콜백이 불리는 시점에는 아직 마운트 전이라, 상태에 담아 둔 뒤 다음 프레임에 호출한다.
  useEffect(() => {
    if (!api) return;
    const frame = requestAnimationFrame(() =>
      api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.95 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [api]);

  return (
    <div className="drawing" style={{ height }}>
      <Excalidraw
        viewModeEnabled
        zenModeEnabled
        excalidrawAPI={setApi}
        initialData={{
          // 플러그인이 저장한 appState 전체를 넘기면 collaborators 등이 Map이 아니라서 깨지므로 배경색만 쓴다.
          elements: scene.elements as never,
          appState: { viewBackgroundColor: background },
          files: (scene.files ?? {}) as never,
        }}
      />
    </div>
  );
}
`````

**`src/components/DrawingBlock.tsx`**

`````tsx
import { docUrl } from "@/lib/github/tree";
import type { DrawingResult } from "@/lib/docs";
import { ExcalidrawView } from "./ExcalidrawView";

const REASONS: Record<string, string> = {
  "not-found": "그림 파일을 찾지 못했어요",
  "no-drawing-block": "그림 데이터가 없어요",
  "too-large": "그림 데이터가 너무 커요",
  "decompress-failed": "그림 데이터를 풀지 못했어요",
  "invalid-json": "그림 데이터가 깨져 있어요",
  "invalid-scene": "그림 데이터 모양이 올바르지 않아요",
};

type Props = {
  path: string;
  result: DrawingResult;
  sourceUrl: string;
  /** 문서 안에 끼워 넣을 때는 true(작은 높이와 "크게 보기" 링크), 단독 화면에서는 false */
  inline?: boolean;
};

/** 그림 하나를 그리거나, 그릴 수 없으면 그 자리에만 이유와 원본 링크를 보여준다. */
export function DrawingBlock({ path, result, sourceUrl, inline = false }: Props) {
  if (!result.ok) {
    return (
      <p className="drawing-error" role="alert">
        그림을 표시할 수 없어요 ({REASONS[result.reason] ?? result.reason}).{" "}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          GitHub에서 원본 보기
        </a>
      </p>
    );
  }
  return (
    <figure className="drawing-figure">
      <ExcalidrawView scene={result.scene} height={inline ? "60vh" : "80vh"} />
      {inline && (
        <figcaption>
          <a href={docUrl(path)}>크게 보기</a>
        </figcaption>
      )}
    </figure>
  );
}
`````

**`src/components/MarkdownView.tsx`**

`````tsx
import type { Root as HastRoot } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { DrawingResult } from "@/lib/docs";
import { DrawingBlock } from "./DrawingBlock";

/** hast-util-to-jsx-runtime이 모든 요소에 넘기는 `node` 속성을 DOM에 흘리지 않도록 뺀다. */
function omitNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node, ...rest } = props;
  void node;
  return rest;
}

type Props = {
  tree: HastRoot;
  drawings: Record<string, DrawingResult>;
  /** 그림을 못 그릴 때 보여줄 GitHub 원본 주소를 만드는 함수 */
  sourceUrlFor: (path: string) => string;
};

/** 변환 모듈이 만든 hast를 React 요소로 바꿔 그린다. Excalidraw 자리표시는 그림 블록으로 바꾼다. */
export function MarkdownView({ tree, drawings, sourceUrlFor }: Props) {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: {
      div(props: ComponentProps<"div"> & { "data-excalidraw"?: string; node?: unknown }) {
        const { "data-excalidraw": drawingPath, ...rest } = omitNode(props);
        if (drawingPath) {
          return (
            <DrawingBlock
              inline
              path={drawingPath}
              result={drawings[drawingPath] ?? { ok: false, reason: "not-found" }}
              sourceUrl={sourceUrlFor(drawingPath)}
            />
          );
        }
        return <div {...rest} />;
      },
      a(props: ComponentProps<"a"> & { node?: unknown }) {
        const rest = omitNode(props);
        const external = typeof rest.href === "string" && /^https?:\/\//i.test(rest.href);
        return external ? <a {...rest} target="_blank" rel="noopener noreferrer" /> : <a {...rest} />;
      },
      img(props: ComponentProps<"img"> & { node?: unknown }) {
        const { alt, ...rest } = omitNode(props);
        // eslint-disable-next-line @next/next/no-img-element -- 외부(raw.githubusercontent.com) 이미지를 그대로 보여준다.
        return <img {...rest} alt={alt ?? ""} loading="lazy" decoding="async" />;
      },
    },
  });
}
`````

- [ ] **Step 7: 페이지와 스타일을 만든다**

문서 상세 페이지는 Next.js가 `params`를 이미 디코딩해서 넘기므로(실제로 확인함) 다시 디코딩하지 않는다. 홈(`/`)은 `fetch`의 `next.revalidate`(600초) 때문에 정적 페이지로 만들어지고 10분마다 갱신되며, 문서 상세는 요청 때마다 렌더링하되 데이터는 캐시에서 가져온다.

create-next-app이 만든 `src/app/page.module.css`는 지운다.

```bash
rm src/app/page.module.css
```

**`src/app/layout.tsx`**

`````tsx
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Docs Backoffice", template: "%s · Docs Backoffice" },
  description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <Link href="/" className="site-title">
            Docs Backoffice
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
`````

**`src/app/page.tsx`**

`````tsx
import { DocTree } from "@/components/DocTree";
import { RelativeTime } from "@/components/RelativeTime";
import { StaleBanner } from "@/components/StaleBanner";
import { loadConfig } from "@/lib/config";
import { getLatestCommitOrNull, getTree } from "@/lib/github";
import { buildTreeGroups } from "@/lib/github/tree";

export default async function HomePage() {
  const config = loadConfig();
  const [{ value: entries, stale }, commit] = await Promise.all([getTree(), getLatestCommitOrNull()]);
  const groups = buildTreeGroups(entries, config.docsPaths);

  return (
    <main className="page">
      <h1>문서</h1>
      {stale && <StaleBanner />}
      {commit && (
        <p className="meta">
          마지막 반영: <RelativeTime iso={commit.committedAt} /> · {config.branch}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="empty">표시할 문서가 없어요.</p>
      ) : (
        groups.map((group) => (
          <section key={group.root} className="group">
            <h2>{group.label}</h2>
            <DocTree nodes={group.nodes} />
          </section>
        ))
      )}
    </main>
  );
}
`````

**`src/app/docs/[...path]/page.tsx`**

`````tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DrawingBlock } from "@/components/DrawingBlock";
import { MarkdownView } from "@/components/MarkdownView";
import { StaleBanner } from "@/components/StaleBanner";
import { Toc } from "@/components/Toc";
import { loadConfig } from "@/lib/config";
import { loadDocPage } from "@/lib/docs";
import { pathFromSegments } from "@/lib/github/tree";
import { blobUrl } from "@/lib/transform/repo-urls";

type Props = { params: Promise<{ path: string[] }> };

// Next.js가 params를 이미 디코딩해서 넘겨주므로 다시 디코딩하지 않는다.
async function resolve(params: Props["params"]) {
  const path = pathFromSegments((await params).path);
  return path ? loadDocPage(path) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await resolve(params);
  return { title: page?.title ?? "문서를 찾을 수 없어요" };
}

export default async function DocPage({ params }: Props) {
  const page = await resolve(params);
  if (!page) notFound();

  const config = loadConfig();
  const repo = { ...config.repo, branch: config.branch };

  if (page.kind === "drawing") {
    return (
      <main className="page page-wide">
        <p className="crumb">
          <Link href="/">← 문서 목록</Link>
        </p>
        <h1>{page.title}</h1>
        {page.stale && <StaleBanner />}
        <DrawingBlock path={page.path} result={page.result} sourceUrl={page.sourceUrl} />
        <p className="meta">
          <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">
            GitHub에서 보기
          </a>
        </p>
      </main>
    );
  }

  const { doc } = page;
  return (
    <main className="page">
      <p className="crumb">
        <Link href="/">← 문서 목록</Link>
      </p>
      {!doc.hasH1 && <h1>{page.title}</h1>}
      {(doc.frontmatter.date || doc.frontmatter.tags.length > 0) && (
        <p className="meta">
          {doc.frontmatter.date && <time dateTime={doc.frontmatter.date}>{doc.frontmatter.date}</time>}
          {doc.frontmatter.tags.map((tag) => (
            <span key={tag} className="tag">
              #{tag}
            </span>
          ))}
        </p>
      )}
      {page.stale && <StaleBanner />}
      {doc.frontmatterError && (
        <p className="banner" role="status">
          문서 상단 정보(frontmatter)를 읽지 못해서 본문만 보여드려요.
        </p>
      )}
      <Toc headings={doc.toc} />
      <article className="markdown">
        <MarkdownView
          tree={doc.tree}
          drawings={page.drawings}
          sourceUrlFor={(path) => blobUrl(repo, path)}
        />
      </article>
      <p className="meta footer-meta">
        <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">
          GitHub에서 보기
        </a>
      </p>
    </main>
  );
}
`````

**`src/app/error.tsx`**

`````tsx
"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <h1>문서를 불러오지 못했어요</h1>
      <p>GitHub에서 문서를 가져오는 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.</p>
      <p>
        <button type="button" onClick={reset}>
          다시 시도
        </button>
      </p>
    </main>
  );
}
`````

**`src/app/not-found.tsx`**

`````tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1>문서를 찾을 수 없어요</h1>
      <p>주소가 바뀌었거나 표시하지 않는 문서예요.</p>
      <p>
        <Link href="/">문서 목록으로 돌아가기</Link>
      </p>
    </main>
  );
}
`````

**`src/app/globals.css`**

`````css
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #656d76;
  --border: #d0d7de;
  --accent: #0969da;
  --code-bg: #f6f8fa;
  --banner-bg: #fff8c5;
  --error-bg: #ffebe9;
}

* {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  line-height: 1.7;
}

a {
  color: var(--accent);
}

.site-header {
  padding: 0.75rem 16px;
  border-bottom: 1px solid var(--border);
}

.site-title {
  color: var(--fg);
  font-weight: 700;
  text-decoration: none;
}

.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.25rem 16px 4rem;
}

.page-wide {
  max-width: 72rem;
}

.crumb,
.meta {
  color: var(--muted);
  font-size: 0.9rem;
}

.tag {
  margin-left: 0.5rem;
}

.banner {
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  background: var(--banner-bg);
}

.empty {
  color: var(--muted);
}

.group h2 {
  font-size: 1rem;
  color: var(--muted);
  word-break: break-all;
}

.tree {
  list-style: none;
  margin: 0;
  padding-left: 1rem;
}

.tree > li {
  padding: 0.15rem 0;
}

.tree summary {
  cursor: pointer;
}

.toc {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
}

.toc ul {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
}

.markdown {
  overflow-wrap: anywhere;
}

.markdown img {
  max-width: 100%;
  height: auto;
}

.markdown pre {
  overflow-x: auto;
  padding: 0.85rem 1rem;
  border-radius: 6px;
  background: var(--code-bg);
  font-size: 0.85rem;
  line-height: 1.5;
}

.markdown code {
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: var(--code-bg);
  font-size: 0.9em;
}

.markdown pre code {
  padding: 0;
  background: none;
}

.markdown table {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}

.markdown th,
.markdown td {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
}

.markdown blockquote {
  margin-left: 0;
  padding-left: 1rem;
  border-left: 4px solid var(--border);
  color: var(--muted);
}

.markdown h1,
.markdown h2,
.markdown h3 {
  scroll-margin-top: 1rem;
}

.wikilink-missing {
  color: var(--muted);
  text-decoration: underline dotted;
  cursor: help;
}

.drawing-figure {
  margin: 1.25rem 0;
}

.drawing {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.drawing-loading {
  padding: 1rem;
  color: var(--muted);
}

.drawing-error {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  background: var(--error-bg);
}

figcaption {
  margin-top: 0.4rem;
  font-size: 0.85rem;
}

.footer-meta {
  margin-top: 2rem;
}

button {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--code-bg);
  font: inherit;
  cursor: pointer;
}
`````

- [ ] **Step 8: 전체 검사를 돌린다**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 테스트 12개 파일 108개 통과, 타입 오류 없음, 린트 오류와 경고 없음.

- [ ] **Step 9: 커밋한다**

```bash
git add -A
git commit -m "feat: add document list and detail pages with Excalidraw viewer"
```

---

### Task 11: 통합 확인과 배포 안내

**Files:**
- Create: `scripts/simulate-webhook.sh`
- Modify: `README.md`(실측 결과를 "운영 메모"에 기록)

**Interfaces:**
- Consumes: 앞 작업의 전체 결과
- Produces: 실제 요청으로 확인된 동작, Vercel 배포, GitHub webhook 등록 절차

앞의 작업들은 단위 테스트로 검증했다. 이 작업은 **진짜 서버와 진짜 GitHub 저장소**로 스펙의 성공 기준 1~3을 확인한다.

- [ ] **Step 1: webhook 흉내 스크립트를 만든다**

서명 계산을 손으로 하면 틀리기 쉬워서, GitHub이 보내는 것과 같은 서명 요청을 만드는 스크립트를 둔다.

**`scripts/simulate-webhook.sh`**

`````bash
#!/usr/bin/env bash
# GitHub이 보내는 것과 같은 서명이 붙은 push webhook 요청을 흉내 낸다.
#
# 사용법: scripts/simulate-webhook.sh <서버 주소> <비밀키> [ref] [바뀐 문서 경로]
# 예:     scripts/simulate-webhook.sh http://localhost:3112 test-secret
#         scripts/simulate-webhook.sh http://localhost:3112 test-secret refs/heads/feature/x
set -euo pipefail

BASE="${1:?서버 주소를 넣어 주세요. 예: http://localhost:3112}"
SECRET="${2:?webhook 비밀키를 넣어 주세요}"
REF="${3:-refs/heads/develop}"
FILE="${4:-frontend/docs/plan/m0-scaffolding.md}"

BODY=$(printf '{"ref":"%s","after":"simulated","commits":[{"modified":["%s"]}]}' "$REF" "$FILE")
SIGNATURE="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

curl -sS -w '\nHTTP %{http_code}\n' -X POST "$BASE/api/github-webhook" \
  -H 'content-type: application/json' \
  -H 'x-github-event: push' \
  -H "x-hub-signature-256: $SIGNATURE" \
  --data-binary "$BODY"
`````

```bash
chmod +x scripts/simulate-webhook.sh
```

- [ ] **Step 2: 프로덕션 빌드를 만들고 서버를 띄운다**

`GITHUB_TOKEN`이 없으면 시간당 60회 한도라서 반복 확인 중 한도에 걸릴 수 있다. 한도에 걸리면 `RateLimitError`가 나는 것이 정상 동작이니 잠시 기다렸다가 다시 하거나 읽기 전용 토큰을 넣는다.

```bash
export GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3 GITHUB_BRANCH=develop DOCS_PATHS=frontend/docs/plan GITHUB_WEBHOOK_SECRET=test-secret
npm run build
npm run start -- -p 3112
```

Expected: 빌드 결과에 `○ /`(Revalidate `10m`), `ƒ /api/github-webhook`, `ƒ /docs/[...path]`가 나온다. 서버는 다른 터미널을 열어 다음 단계를 진행하는 동안 계속 둔다.

- [ ] **Step 3: 페이지와 경로 차단을 확인한다**

```bash
B=http://localhost:3112
curl -s -o /dev/null -w "목록 %{http_code}\n" "$B/"
curl -s "$B/" | grep -o 'href="/docs/[^"]*"'
curl -s -o /dev/null -w "문서 %{http_code} %{time_total}s\n" "$B/docs/frontend/docs/plan/m3-routing-and-data-layer.md"
for p in "frontend/docs/plan/nope.md" "frontend/src/App.tsx" "README.md" "frontend/docs/plan-old/x.md" "frontend/docs/plan/a%2Fb.md" "frontend/docs/plan/..%2F..%2FREADME.md"; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "$B/docs/$p"
done
```

Expected: 목록 200에 `frontend/docs/plan`의 문서 링크가 나오고(현재 7개), 문서는 200, 나머지 여섯 경로는 모두 **404**.

- [ ] **Step 4: webhook이 캐시를 무효화하는지 확인한다**

```bash
B=http://localhost:3112
DOC="$B/docs/frontend/docs/plan/m3-routing-and-data-layer.md"
curl -s -o /dev/null -w "무효화 전 %{time_total}s\n" "$DOC"
scripts/simulate-webhook.sh "$B" test-secret
curl -s -o /dev/null -w "무효화 직후 첫 요청 %{time_total}s\n" "$DOC"
curl -s -o /dev/null -w "다음 요청 %{time_total}s\n" "$DOC"
scripts/simulate-webhook.sh "$B" wrong-secret
scripts/simulate-webhook.sh "$B" test-secret refs/heads/feature/x
```

Expected:
- 올바른 비밀키의 push → `{"revalidated":true,"changedDocs":1}` `HTTP 200`
- 무효화 직후 첫 요청은 트리를 다시 받느라 0.05~0.1초로 조금 느리고(네트워크에 따라 다르다), 다음 요청은 0.02초 안팎으로 빠르다
- 틀린 비밀키 → `HTTP 401`
- 다른 브랜치 push → `{"ignored":"다른 브랜치예요"}` `HTTP 202`

확인이 끝나면 서버를 끈다(`Ctrl+C`).

- [ ] **Step 5: 브라우저에서 실제 Excalidraw 그림을 확인한다**

문서 저장소 `develop`에는 아직 `.excalidraw.md`가 없어서, 임시 화면으로 사용자의 로컬 샘플 파일을 띄워 본다. **이 임시 파일은 커밋하지 않는다.** 샘플 경로는 환경변수 `EXCALIDRAW_SAMPLE`로 넘긴다.

`src/app/probe-drawing/page.tsx`를 만든다.

```tsx
import { readFileSync } from "node:fs";
import { DrawingBlock } from "@/components/DrawingBlock";
import { extractExcalidraw } from "@/lib/transform/excalidraw";

export const dynamic = "force-dynamic";

export default function Probe() {
  const file = process.env.EXCALIDRAW_SAMPLE;
  if (!file) return <main className="page">EXCALIDRAW_SAMPLE 환경변수에 .excalidraw.md 파일 경로를 넣어 주세요.</main>;
  const result = extractExcalidraw(readFileSync(file, "utf8"));
  return (
    <main className="page page-wide">
      <h1>probe</h1>
      <DrawingBlock path="probe.excalidraw.md" result={result} sourceUrl="#" />
    </main>
  );
}
```

```bash
export EXCALIDRAW_SAMPLE="C:/Users/jhcho/Documents/Obsidian/spicy pringles/Manager's Manager/Manager's Manager 프론트엔드 흐름.excalidraw.md"
npm run dev -- -p 3113
```

브라우저에서 `http://localhost:3113/probe-drawing`를 열어 확인한다(첫 접속은 컴파일 때문에 10초 정도 걸린다).

- [ ] 그림이 나타나고 한글이 깨지지 않는다
- [ ] 처음부터 그림 전체가 화면에 맞춰 보인다(큰 그림은 10% 안팎까지 줄어든다)
- [ ] 확대(+)·축소(−) 버튼과 마우스 이동이 된다
- [ ] 개발자 도구 콘솔에 오류가 없다
- [ ] 그림 위에서 마우스 휠을 굴렸을 때 페이지 스크롤이 막히는지 확인한다(막히면 기록해 두고 개선 여부를 사용자와 상의한다)

확인이 끝나면 임시 파일을 지운다.

```bash
rm -r src/app/probe-drawing
git status --short
```

Expected: `git status`에 변경이 없다.

- [ ] **Step 6: Vercel에 배포한다 (사용자 확인 후)**

이 단계는 Vercel에 새 프로젝트를 만드는 일이라 **실행하기 전에 사용자에게 확인한다.**

1. Vercel 대시보드에서 GitHub 저장소 `hotpringles/docs-backoffice`를 Import한다(프레임워크는 Next.js로 자동 인식된다).
2. Environment Variables에 다음을 넣는다: `GITHUB_REPO`, `GITHUB_BRANCH`(`develop`), `DOCS_PATHS`(`frontend/docs/plan`), `GITHUB_TOKEN`(읽기 전용, 공개 저장소 읽기만 되면 된다), `GITHUB_WEBHOOK_SECRET`(길고 무작위인 문자열).
3. Deploy한다. 배포가 끝나면 배포 주소에서 목록과 문서가 열리는지 본다.

- [ ] **Step 7: GitHub webhook을 등록한다 (저장소 관리자, 사용자 확인 후)**

문서 저장소 `kakaotechcampus-4/ktc4-kyungpook-3`의 Settings → Webhooks → Add webhook에서 등록한다. 팀 저장소이므로 팀원에게 알리고 진행한다.

- Payload URL: `https://<배포 주소>/api/github-webhook`
- Content type: **`application/json`** (폼 방식이면 서버가 400으로 안내한다)
- Secret: Vercel에 넣은 `GITHUB_WEBHOOK_SECRET`과 같은 값
- Which events: **Just the push event**
- Active 체크

등록하면 GitHub이 `ping`을 보낸다. Recent Deliveries에서 응답이 `200`이고 본문이 `{"pong":true}`인지 확인한다.

- [ ] **Step 8: 실제 push로 반영 시간을 잰다 (사용자 확인 후)**

`develop`에 실제로 push해야 하는 단계라 팀과 상의해서, 되돌릴 수 있는 사소한 문서 변경(예: `frontend/docs/plan/prev-todo-m3.md`의 공백 한 줄)으로 하거나 테스트용 저장소에서 확인한다.

1. 변경을 `develop`에 push(또는 PR 머지)한 시각을 적는다.
2. 배포 주소의 해당 문서를 새로고침해서 변경이 보일 때까지 걸린 시간을 잰다. (스펙 성공 기준 1)
3. GitHub webhook의 Recent Deliveries에서 응답이 `200`인지 확인한다.

- [ ] **Step 9: 결과를 README에 기록하고 커밋한다**

`README.md` 끝에 "운영 메모" 절을 만들어 다음을 적는다: 배포 주소, 반영 시간 실측값, 그림 위 휠 스크롤 동작, 사용한 `DOCS_PATHS`.

```bash
git add README.md scripts/simulate-webhook.sh
git commit -m "docs: add webhook simulation script and operations notes"
```

---

## 자체 점검 (계획 작성자용)

**스펙 대응 (계획 1 범위)**

| 스펙 | 작업 |
|---|---|
| 5.1 GitHub 클라이언트(트리·blob·최신 커밋·한도·대체) | Task 8, 10 |
| 5.2 변환 모듈(위키링크·임베드·상대 링크·Excalidraw·보안) | Task 4, 5, 6, 7 |
| 5.3 webhook(서명·브랜치 필터·캐시 무효화) | Task 9 |
| 6.1 문서 목록, 6.2 문서 상세, 그림 화면 | Task 10 |
| 7 오류 처리(한도·404·그림 실패·frontmatter 실패) | Task 8, 10 |
| 8 테스트(변환·webhook·GitHub 클라이언트) | Task 2~9 |
| 성공 기준 1(반영 시간), 2(그림), 3(위키링크) | Task 6, 11 |

계획 2(5.3의 알림 발송과 중복 방지, 5.4, 5.5, 6.3)와 계획 3(5.6~5.8, 6.4)은 이 계획의 범위 밖이다.

**구현 중 스펙과 달라진 점** (스펙에는 이미 반영했다): 원본 이미지 주소는 커밋 SHA가 아니라 브랜치 기준이다. 풀 수 없는 상대 링크는 "없는 문서" 표시로 바꾼다.
