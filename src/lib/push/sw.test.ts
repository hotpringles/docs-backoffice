import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

const ORIGIN = "https://docs.example.com";
const source = readFileSync("public/sw.js", "utf8");

/** 서비스 워커의 전역(`self`)을 흉내 내서 `public/sw.js`를 실제로 실행한다. */
function loadServiceWorker() {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const matchAll = vi.fn<() => Promise<unknown[]>>(async () => []);
  const skipWaiting = vi.fn();

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification },
    clients: { openWindow, claim, matchAll },
    location: { origin: ORIGIN },
    skipWaiting,
  };
  vm.runInNewContext(source, { self, URL, Promise, JSON, Object });

  /** 이벤트를 보내고, `waitUntil`에 넘겨진 작업이 끝나기를 기다린다. */
  async function dispatch(type: string, event: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    return waits.length;
  }
  /** `raw`가 Error면 `event.data.json()`이 깨진 JSON처럼 던지고, undefined면 본문(data)이 없다. */
  const pushEvent = (raw: unknown) => ({
    data:
      raw === undefined
        ? null
        : {
            json: () => {
              if (raw instanceof Error) throw raw;
              return raw;
            },
          },
  });
  return { dispatch, pushEvent, showNotification, openWindow, matchAll, claim, skipWaiting, listeners };
}

let sw: ReturnType<typeof loadServiceWorker>;
beforeEach(() => {
  sw = loadServiceWorker();
});

describe("push 이벤트", () => {
  it("제목, 본문, 열 주소, tag로 알림을 띄운다", async () => {
    await sw.dispatch(
      "push",
      sw.pushEvent({ title: "문서가 업데이트됐어요", body: "m3", url: "/docs/a.md", tag: "docs-updated" }),
    );
    expect(sw.showNotification).toHaveBeenCalledExactlyOnceWith("문서가 업데이트됐어요", {
      body: "m3",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/docs/a.md" },
      tag: "docs-updated",
    });
  });

  it("본문이 없거나 깨져도(iOS는 알림을 안 띄우면 구독을 취소한다) 기본 문구로 반드시 띄운다", async () => {
    for (const event of [
      sw.pushEvent(undefined),
      sw.pushEvent(new Error("깨진 JSON")),
      sw.pushEvent("문자열"),
      sw.pushEvent(null),
      sw.pushEvent({}),
      sw.pushEvent({ title: 5, body: {}, url: null }),
    ]) {
      sw.showNotification.mockClear();
      await sw.dispatch("push", event);
      expect(sw.showNotification, JSON.stringify(event)).toHaveBeenCalledOnce();
      expect(sw.showNotification).toHaveBeenCalledWith("문서 백오피스", {
        body: "새 소식이 있어요.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/" },
      });
    }
  });

  it("사이트 밖 주소는 홈으로 바꾼다", async () => {
    for (const url of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "docs/a.md", ""]) {
      sw.showNotification.mockClear();
      await sw.dispatch("push", sw.pushEvent({ title: "t", body: "b", url }));
      const options = sw.showNotification.mock.calls[0] as unknown as [string, { data: { url: string } }];
      expect(options[1].data.url, url).toBe("/");
    }
  });
});

describe("notificationclick 이벤트", () => {
  const click = (url: unknown) => {
    const close = vi.fn();
    return { close, event: { notification: { close, data: url === undefined ? undefined : { url } } } };
  };

  it("알림을 닫고, 열린 창이 없으면 새 창으로 해당 주소를 연다", async () => {
    const { close, event } = click("/docs/a.md");
    await sw.dispatch("notificationclick", event);
    expect(close).toHaveBeenCalledOnce();
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/docs/a.md`);
  });

  it("이미 열린 우리 사이트 창이 있으면 그 창을 앞으로 가져와서 이동한다", async () => {
    const focus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => undefined);
    sw.matchAll.mockResolvedValue([
      { url: "https://other.example/", focus: vi.fn(), navigate: vi.fn() },
      { url: `${ORIGIN}/`, focus, navigate },
    ]);

    await sw.dispatch("notificationclick", click("/docs/a.md").event);

    expect(focus).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/docs/a.md`);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("사이트 밖 주소나 주소가 없는 알림은 홈을 연다", async () => {
    for (const url of ["https://evil.example/x", "//evil.example", undefined]) {
      sw.openWindow.mockClear();
      await sw.dispatch("notificationclick", click(url).event);
      expect(sw.openWindow, String(url)).toHaveBeenCalledWith(`${ORIGIN}/`);
    }
  });
});

describe("설치와 활성화", () => {
  it("설치 즉시 활성화하고, 활성화되면 열린 페이지를 바로 제어한다", async () => {
    await sw.dispatch("install", {});
    expect(sw.skipWaiting).toHaveBeenCalledOnce();
    await sw.dispatch("activate", {});
    expect(sw.claim).toHaveBeenCalledOnce();
  });
});
