import { urlBase64ToUint8Array } from "./client-state";

/** 브라우저의 PushSubscription 중 우리가 쓰는 부분 */
export type SubscriptionLike = {
  endpoint: string;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
};

export type RegistrationLike = {
  pushManager: {
    getSubscription(): Promise<SubscriptionLike | null>;
    subscribe(options: {
      userVisibleOnly: true;
      applicationServerKey: Uint8Array<ArrayBuffer>;
    }): Promise<SubscriptionLike>;
  };
};

/** 브라우저 API를 주입받아서, 진짜 브라우저 없이도 구독 흐름을 시험할 수 있게 한다. */
export type PushClientDeps = {
  publicKey: string;
  serviceWorker: {
    register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<unknown>;
    ready: Promise<RegistrationLike>;
  };
  requestPermission(): Promise<NotificationPermission>;
  fetchImpl: typeof fetch;
};

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "server" | "error"; message: string };

const API = "/api/push/subscriptions";
const JSON_HEADERS = { "content-type": "application/json" };

async function registration(deps: PushClientDeps): Promise<RegistrationLike> {
  await deps.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return deps.serviceWorker.ready;
}

/** 지금 이 기기에 구독이 있는지. 서비스 워커도 이때 등록한다. */
export async function currentSubscription(deps: PushClientDeps): Promise<SubscriptionLike | null> {
  return (await registration(deps)).pushManager.getSubscription();
}

/**
 * 알림 구독. 사용자가 버튼을 누른 직후에 불러야 한다(권한 요청은 사용자 동작에 대한 응답이어야 하고,
 * 그래서 다른 비동기 작업보다 먼저 권한부터 묻는다).
 * 서버에 저장하지 못하면 브라우저 쪽 구독도 되돌려서, 알림을 받는다고 착각하지 않게 한다.
 */
export async function subscribe(deps: PushClientDeps): Promise<SubscribeResult> {
  try {
    const permission = await deps.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "denied", message: "알림 권한이 허용되지 않았어요." };
    }

    const { pushManager } = await registration(deps);
    const subscription = await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(deps.publicKey),
    });

    const response = await deps.fetchImpl(API, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) {
      await subscription.unsubscribe().catch(() => undefined);
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, reason: "server", message: detail?.error ?? "서버에 알림을 등록하지 못했어요." };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "알림을 켜지 못했어요.",
    };
  }
}

/**
 * 알림 해제. 브라우저 구독을 먼저 끊고, 서버 삭제는 실패해도 넘어간다
 * (남은 구독은 다음 발송 때 푸시 서비스가 404/410으로 알려 줘서 서버가 지운다).
 */
export async function unsubscribe(deps: PushClientDeps): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const subscription = await currentSubscription(deps);
    if (!subscription) return { ok: true };

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await deps
      .fetchImpl(API, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ endpoint }) })
      .catch(() => undefined);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "알림을 끄지 못했어요." };
  }
}
