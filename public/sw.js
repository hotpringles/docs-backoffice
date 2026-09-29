// 푸시 알림을 받아 화면에 띄우는 서비스 워커.
// 주의: iOS(Safari)는 푸시를 받고도 알림을 띄우지 않으면 구독을 취소해 버리므로,
// push 이벤트에서는 어떤 경우에도 반드시 알림을 띄운다.

const DEFAULT_TITLE = "문서 백오피스";
const DEFAULT_BODY = "새 소식이 있어요.";
const ICON = "/icon-192.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** 사이트 안의 경로(`/`로 시작, `//`로 시작하지 않음)만 열 수 있다. 그 밖의 값은 홈으로 바꾼다. */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const title = typeof data.title === "string" && data.title ? data.title : DEFAULT_TITLE;
  const body = typeof data.body === "string" && data.body ? data.body : DEFAULT_BODY;
  const options = { body, icon: ICON, badge: ICON, data: { url: safePath(data.url) } };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
