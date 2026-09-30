"use client";

import { useEffect, useId, useState } from "react";
import { currentSubscription, subscribe, unsubscribe, type PushClientDeps, type RegistrationLike } from "@/lib/push/client";
import { detectPushSupport, type PushEnv, type PushSupport } from "@/lib/push/client-state";

// 빌드할 때 값이 코드에 들어간다. 비어 있으면 알림 설정이 준비되지 않은 것이다.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function readEnv(): PushEnv {
  const hasNotification = "Notification" in window;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification,
    permission: hasNotification ? Notification.permission : "unsupported",
  };
}

function browserDeps(): PushClientDeps {
  return {
    publicKey: PUBLIC_KEY,
    serviceWorker: {
      register: (url, options) => navigator.serviceWorker.register(url, options),
      ready: navigator.serviceWorker.ready as Promise<RegistrationLike>,
    },
    requestPermission: () => Notification.requestPermission(),
    fetchImpl: (input, init) => fetch(input, init),
  };
}

type State = { support: PushSupport | "loading"; subscribed: boolean; busy: boolean; error: string | null };

export function NotificationBell() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ support: "loading", subscribed: false, busy: false, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = detectPushSupport(readEnv());
      const subscribed = support === "ready" && PUBLIC_KEY ? Boolean(await currentSubscription(browserDeps()).catch(() => null)) : false;
      if (!cancelled) setState((s) => ({ ...s, support, subscribed }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function turnOn() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const result = await subscribe(browserDeps());
    setState((s) => ({
      ...s,
      busy: false,
      subscribed: result.ok,
      // 권한을 차단하면 패널이 "차단됨" 안내로 바뀌고, 팝업만 닫았다면(아직 결정 안 함) 이유를 문구로 알려준다.
      support: !result.ok && result.reason === "denied" ? detectPushSupport(readEnv()) : s.support,
      error: result.ok ? null : result.message,
    }));
  }

  async function turnOff() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const result = await unsubscribe(browserDeps());
    setState((s) => ({ ...s, busy: false, subscribed: !result.ok, error: result.ok ? null : result.message }));
  }

  return (
    <div className="notify">
      <button
        type="button"
        className="notify-button"
        aria-label="알림 설정"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{state.subscribed ? "🔔" : "🔕"}</span>
      </button>
      {open && (
        <section id={panelId} className="notify-panel" aria-label="알림 설정">
          <Panel state={state} onTurnOn={turnOn} onTurnOff={turnOff} />
        </section>
      )}
    </div>
  );
}

function Panel({ state, onTurnOn, onTurnOff }: { state: State; onTurnOn: () => void; onTurnOff: () => void }) {
  if (state.support === "loading") return <p>확인하는 중…</p>;
  if (state.support === "unsupported") return <p>이 브라우저는 푸시 알림을 지원하지 않아요.</p>;
  if (state.support === "ios-needs-install") {
    return (
      <p>
        iPhone·iPad에서는 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요. Safari의 <strong>공유 버튼 → 홈 화면에
        추가</strong>를 누른 뒤, 홈 화면의 앱으로 다시 열어 주세요.
      </p>
    );
  }
  if (state.support === "denied") {
    return <p>알림이 차단돼 있어요. 브라우저(또는 기기) 설정에서 이 사이트의 알림을 허용한 뒤 다시 열어 주세요.</p>;
  }
  if (!PUBLIC_KEY) return <p>알림 설정이 아직 준비되지 않았어요.</p>;

  return (
    <>
      <p>{state.subscribed ? "이 기기에서 알림을 받고 있어요." : "일정과 모임 소식을 알림으로 받을 수 있어요."}</p>
      <button type="button" disabled={state.busy} onClick={state.subscribed ? onTurnOff : onTurnOn}>
        {state.busy ? "처리 중…" : state.subscribed ? "알림 끄기" : "알림 받기"}
      </button>
      {state.error && (
        <p className="notify-error" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
}
