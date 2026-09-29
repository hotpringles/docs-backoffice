# 문서 뷰어: 최종 검토에서 보류한 항목

계획 1(`docs/superpowers/plans/2026-09-30-document-viewer.md`) 실행 뒤 전체 브랜치 검토에서 나온 Minor 항목이다. 지금 범위에서는 고치지 않기로 했고, 필요해질 때 하나씩 처리한다. Critical과 Important 네 건은 이미 고쳤다(계획 끝의 "최종 검토 후 수정" 참고).

## 성능과 캐시

1. **Excalidraw CSS(142KB)가 모든 문서 페이지에서 로드된다.** `ExcalidrawView.tsx`가 `index.css`를 정적으로 import한다. 동적으로 불러오는 모듈 쪽으로 옮기면 그림이 있는 페이지에서만 받는다.
2. **문서를 볼 때마다 변환을 다시 돌린다.** 파싱 결과를 blob SHA 기준으로 캐시하는 방안이 있다.
3. **문서 하나에 임베드할 수 있는 그림 개수에 제한이 없고, 임베드마다 Excalidraw가 바로 올라온다.** 개수 상한과 화면에 들어왔을 때 올리는 지연 로딩(`IntersectionObserver`)이 필요하다.
4. **토큰을 바꾸면 영구 blob 캐시가 비워진다.** `Authorization`이 Next.js fetch 캐시 키에 들어간다. 2MB를 넘는 응답은 데이터 캐시에 저장되지 않는다(개발 모드에서는 오류).
5. **홈(`/`)이 "불러오지 못했어요" 배너를 그대로 굳혀서 최대 10분 보여줄 수 있다.** GitHub이 복구된 뒤에도 캐시된 HTML에 배너가 남는다.

## 보안과 안정성

6. **그림 압축 해제 크기를 제한하지 않는다.** 압축 문자열 길이만 제한해서, 악의적인 파일(약 100KB 압축)이 서버 메모리를 쓸 수 있다. 더 낮은 상한, `TreeEntry.size` 사전 확인, 또는 크기가 제한되는 압축 해제기가 필요하다.
7. **손상된 그림 데이터를 감싸는 클라이언트 오류 처리가 없다.** 배열 모양만 맞는 깨진 장면이 Excalidraw를 죽일 수 있다. 작은 오류 경계를 두면 된다.
8. **Excalidraw 글꼴을 외부 CDN(`esm.sh`)에서 받는다.** 글꼴을 `public/`에 두고 `window.EXCALIDRAW_ASSET_PATH`를 설정한다.
9. **추가 보안 강화:** `config.ts`에 `import "server-only"`, CSP와 `Referrer-Policy` 헤더, `<img referrerPolicy="no-referrer">`.
10. **webhook 서명 계산을 `request.text()`로 한다.** Fetch 명세상 앞의 BOM이 지워지고 잘못된 바이트가 바뀐다. `arrayBuffer()`가 엄밀한 원본이다(GitHub 본문에서는 영향 없음).

## 동작과 표시

11. **참조 방식 이미지가 깨진다.** `![alt][p]`와 `[p]: img/pic.png`가 `raw`가 아니라 GitHub 화면 주소로 바뀐다.
12. **설정 오류가 GitHub 실패처럼 보인다.** `loadConfig`의 `ConfigError`도 "GitHub에서 가져오는 중 문제" 화면과 소용없는 다시 시도 버튼으로 나온다.
13. **쓰레기 위키링크(`[[ ]]`, `[[|]]`, `[[#]]`)가 빈 표시나 이상한 "없는 문서"로 남는다.** 죽지는 않는다.
14. **접근성:** "없는 문서" 표시의 뜻이 색과 `title`로만 전달된다. `table{display:block}`이 표 의미를 잃게 한다. `🎨` 접두사에 이름이 없다. 목록과 목차 링크의 터치 영역이 작다. `scroll-margin-top`이 h4를 빼먹는다. 그림 캔버스에 접근 가능한 이름이 없다.

## 정리와 문서

15. **`package.json`의 이름이 `document-viewer`다.** 워크트리 폴더 이름이 들어갔다. `docs-backoffice`로 바꾸고, 쓰지 않는 `public/*.svg`와 기본 파비콘을 지운다.
16. **스펙과 코드가 다른 곳:** 동명이인 위키링크는 스펙(5.2)이 "경로순 첫 번째"라고 하지만 코드는 같은 폴더를 먼저 고른다(Obsidian과 같다). 스펙 10번의 "큰 그림 전송 방식" 결정은 기록되지 않았다(지금은 전체 장면 JSON을 그대로 보낸다).
