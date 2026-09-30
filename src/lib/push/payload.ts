/**
 * 서비스 워커(`public/sw.js`)가 알림으로 바꾸는 내용. 웹 푸시 본문 제한(약 4KB)보다 훨씬 작게 유지한다.
 * 알림 문구를 만드는 쪽(일정 알림, 모임 알림)이 이 모양으로 넘긴다.
 */
export type PushPayload = {
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 사이트 안의 경로(`/`로 시작) */
  url: string;
  /** 같은 tag의 알림은 기기에서 하나로 합쳐진다 */
  tag?: string;
};
