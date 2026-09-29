import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentSubscription,
  subscribe,
  unsubscribe,
  type PushClientDeps,
  type RegistrationLike,
  type SubscriptionLike,
} from "./client";

type SubscribeOptions = Parameters<RegistrationLike["pushManager"]["subscribe"]>[0];

const KEY = "BBpuX8Dc27tDCRJZGNdF_r3i8PXVBddskKblLrI8KR7PPHoCx4aYwvE7jjz97Spr5KJeo_me8wNk1mqf-QrT2sg";
const sub = (): SubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> } => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "P", auth: "A" } }),
  unsubscribe: vi.fn(async () => true),
});

function setup(overrides: Partial<PushClientDeps> = {}) {
  const calls: string[] = [];
  const fetchRequests: { url: string; init: RequestInit | undefined }[] = [];
  const subscribeOptions: SubscribeOptions[] = [];
  const subscription = sub();
  const pushManager = {
    getSubscription: vi.fn(async () => null as SubscriptionLike | null),
    subscribe: vi.fn(async (options: SubscribeOptions) => {
      calls.push("subscribe");
      subscribeOptions.push(options);
      return subscription;
    }),
  };
  const register = vi.fn(async () => {
    calls.push("register");
  });
  const requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
    calls.push("permission");
    return "granted";
  });
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push("fetch");
    fetchRequests.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  });
  const deps: PushClientDeps = {
    publicKey: KEY,
    serviceWorker: { register, ready: Promise.resolve({ pushManager }) },
    requestPermission,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  };
  return {
    deps,
    calls,
    fetchRequests,
    subscribeOptions,
    subscription,
    pushManager,
    register,
    requestPermission,
    fetchImpl,
  };
}

describe("subscribe", () => {
  it("권한을 가장 먼저 묻고, 서비스 워커를 등록해 구독한 뒤 서버에 저장한다", async () => {
    const { deps, calls, subscribeOptions, register, fetchRequests } = setup();

    expect(await subscribe(deps)).toEqual({ ok: true });

    expect(calls).toEqual(["permission", "register", "subscribe", "fetch"]);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(subscribeOptions).toHaveLength(1);
    expect(subscribeOptions[0].userVisibleOnly).toBe(true);
    expect(subscribeOptions[0].applicationServerKey).toHaveLength(65);

    const { url, init } = fetchRequests[0];
    expect(url).toBe("/api/push/subscriptions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "P", auth: "A" },
    });
  });

  it("권한이 허용되지 않으면 서비스 워커도 구독도 서버 호출도 하지 않는다", async () => {
    for (const permission of ["denied", "default"] as const) {
      const { deps, calls } = setup({ requestPermission: async () => permission });
      const result = await subscribe(deps);
      expect(result).toMatchObject({ ok: false, reason: "denied" });
      expect(calls, permission).toEqual([]);
    }
  });

  it("서버가 거절하면(예: 429) 브라우저 구독도 되돌리고 서버가 준 이유를 알려준다", async () => {
    const { deps, subscription } = setup({
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "구독할 수 있는 기기 수를 넘었어요." }), { status: 429 })) as typeof fetch,
    });

    const result = await subscribe(deps);

    expect(result).toEqual({ ok: false, reason: "server", message: "구독할 수 있는 기기 수를 넘었어요." });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("서버 응답 본문이 JSON이 아니어도 기본 문구로 되돌린다", async () => {
    const { deps, subscription } = setup({ fetchImpl: (async () => new Response("oops", { status: 500 })) as typeof fetch });
    const result = await subscribe(deps);
    expect(result).toMatchObject({ ok: false, reason: "server", message: "서버에 알림을 등록하지 못했어요." });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("네트워크 오류나 구독 실패는 던지지 않고 error로 돌려준다", async () => {
    const broken = setup();
    broken.pushManager.subscribe.mockRejectedValue(new Error("push service error"));
    expect(await subscribe(broken.deps)).toEqual({ ok: false, reason: "error", message: "push service error" });
  });

  it("서버에 저장하려다 네트워크가 끊겨도 브라우저 구독을 되돌린다(서버에 없는데 알림을 받는 걸로 보이면 안 된다)", async () => {
    const network = setup({ fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch });
    expect(await subscribe(network.deps)).toEqual({ ok: false, reason: "error", message: "offline" });
    expect(network.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("되돌리다 실패해도 원래 오류를 알려준다", async () => {
    const network = setup({ fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch });
    network.subscription.unsubscribe.mockRejectedValue(new Error("cannot roll back"));
    expect(await subscribe(network.deps)).toEqual({ ok: false, reason: "error", message: "offline" });
  });

  it("구독 만들기 자체가 실패하면 되돌릴 것이 없다", async () => {
    const broken = setup();
    broken.pushManager.subscribe.mockRejectedValue(new Error("push service error"));
    await subscribe(broken.deps);
    expect(broken.subscription.unsubscribe).not.toHaveBeenCalled();
  });
});

describe("currentSubscription", () => {
  it("서비스 워커를 등록하고 현재 구독을 돌려준다(없으면 null)", async () => {
    const { deps, pushManager, register } = setup();
    expect(await currentSubscription(deps)).toBeNull();
    expect(register).toHaveBeenCalledOnce();

    const existing = sub();
    pushManager.getSubscription.mockResolvedValue(existing);
    expect(await currentSubscription(deps)).toBe(existing);
  });
});

describe("unsubscribe", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("구독이 없으면 서버를 부르지 않고 성공이다", async () => {
    expect(await unsubscribe(ctx.deps)).toEqual({ ok: true });
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
  });

  it("브라우저 구독을 끊고 서버에 삭제를 요청한다", async () => {
    const existing = sub();
    ctx.pushManager.getSubscription.mockResolvedValue(existing);

    expect(await unsubscribe(ctx.deps)).toEqual({ ok: true });

    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    const { url, init } = ctx.fetchRequests[0];
    expect(url).toBe("/api/push/subscriptions");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ endpoint: existing.endpoint });
  });

  it("서버 삭제가 실패해도 브라우저 구독은 이미 끊었으니 성공으로 본다", async () => {
    const existing = sub();
    ctx.pushManager.getSubscription.mockResolvedValue(existing);
    const deps = { ...ctx.deps, fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch };
    expect(await unsubscribe(deps)).toEqual({ ok: true });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("브라우저 구독을 끊지 못하면 실패를 알린다", async () => {
    const existing = sub();
    existing.unsubscribe.mockRejectedValue(new Error("cannot"));
    ctx.pushManager.getSubscription.mockResolvedValue(existing);
    expect(await unsubscribe(ctx.deps)).toEqual({ ok: false, message: "cannot" });
  });
});
