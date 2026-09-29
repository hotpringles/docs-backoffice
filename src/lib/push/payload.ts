import { docUrl } from "@/lib/github/tree";
import { displayName } from "@/lib/transform/paths";

/** 서비스 워커(`public/sw.js`)가 알림으로 바꾸는 내용. 웹 푸시 본문 제한(약 4KB)보다 훨씬 작게 유지한다. */
export type PushPayload = {
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 사이트 안의 경로(`/`로 시작) */
  url: string;
  /** 같은 tag의 알림은 기기에서 하나로 합쳐진다 */
  tag?: string;
};

const MAX_NAMES = 3;
const MAX_NAME_LENGTH = 40;
const MAX_URL_LENGTH = 500;

/** 파일 이름은 저장소 안의 내용이라 얼마든지 길 수 있다. 알림 본문이 커지지 않도록 자른다. */
function shorten(name: string): string {
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

/**
 * 문서가 바뀌었다는 알림. 제목 대신 파일 이름을 쓴다(문서 제목을 얻으려면 GitHub 호출이 더 필요하고,
 * webhook 처리 시간을 늘리기 때문이다). 한 문서만 바뀌었으면 그 문서를, 여러 개면 목록을 연다.
 */
export function docsChangedPayload(changedDocs: string[]): PushPayload {
  const names = changedDocs.slice(0, MAX_NAMES).map((path) => shorten(displayName(path)));
  const rest = changedDocs.length - names.length;
  const body = rest > 0 ? `${names.join(", ")} 외 ${rest}건` : names.join(", ");

  const singleUrl = changedDocs.length === 1 ? docUrl(changedDocs[0]) : "/";
  return {
    title: "문서가 업데이트됐어요",
    body,
    url: singleUrl.length <= MAX_URL_LENGTH ? singleUrl : "/",
    tag: "docs-updated",
  };
}
