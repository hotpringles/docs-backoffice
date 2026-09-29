import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import { createSubscriptionHandlers } from "./handlers";
import { listSubscriptions, MAX_SUBSCRIPTIONS } from "./subscriptions";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const validBody = (n = 1) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  keys: { p256dh: P256DH, auth: AUTH },
});

function request(method: "POST" | "DELETE", body: unknown, contentType: string | null = "application/json") {
  return new Request("https://example.com/api/push/subscriptions", {
    method,
    headers: contentType ? { "content-type": contentType } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("구독 API 핸들러", () => {
  let db: Db;
  let close: () => Promise<void>;
  let handlers: ReturnType<typeof createSubscriptionHandlers>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    handlers = createSubscriptionHandlers({ getDb: () => db });
  });
  afterEach(async () => {
    await close();
  });

  it("올바른 구독은 201로 저장하고, 같은 구독을 다시 보내면 200이다", async () => {
    expect((await handlers.POST(request("POST", validBody()))).status).toBe(201);
    expect((await handlers.POST(request("POST", validBody()))).status).toBe(200);
    expect(await listSubscriptions(db)).toHaveLength(1);
  });

  it("JSON이 아닌 Content-Type은 415이고 저장하지 않는다", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", null]) {
      const response = await handlers.POST(request("POST", validBody(), type));
      expect(response.status, String(type)).toBe(415);
    }
    expect(await listSubscriptions(db)).toEqual([]);
  });

  it("깨진 JSON은 400이다", async () => {
    expect((await handlers.POST(request("POST", "{not json"))).status).toBe(400);
  });

  it("허용되지 않는 주소나 잘못된 키는 400이고 이유를 알려준다", async () => {
    const ssrf = await handlers.POST(request("POST", { ...validBody(), endpoint: "https://169.254.169.254/x" }));
    expect(ssrf.status).toBe(400);
    expect((await ssrf.json()).error).toContain("푸시 주소");

    const badKeys = await handlers.POST(request("POST", { ...validBody(), keys: { p256dh: "x", auth: "y" } }));
    expect(badKeys.status).toBe(400);
    expect(await listSubscriptions(db)).toEqual([]);
  });

  it("구독 수 상한을 넘으면 429이다", async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) {
      expect((await handlers.POST(request("POST", validBody(i)))).status).toBe(201);
    }
    expect((await handlers.POST(request("POST", validBody(MAX_SUBSCRIPTIONS)))).status).toBe(429);
  });

  it("DB가 설정되지 않았으면 503이다", async () => {
    const noDb = createSubscriptionHandlers({ getDb: () => null });
    expect((await noDb.POST(request("POST", validBody()))).status).toBe(503);
    expect((await noDb.DELETE(request("DELETE", { endpoint: validBody().endpoint }))).status).toBe(503);
  });

  it("해제하면 204이고 저장소에서 사라진다. 없는 주소를 지워도 204다", async () => {
    await handlers.POST(request("POST", validBody()));
    const removed = await handlers.DELETE(request("DELETE", { endpoint: validBody().endpoint }));
    expect(removed.status).toBe(204);
    expect(await listSubscriptions(db)).toEqual([]);

    const again = await handlers.DELETE(request("DELETE", { endpoint: validBody().endpoint }));
    expect(again.status).toBe(204);
  });

  it("해제 요청에 endpoint가 없거나 JSON이 아니면 거부한다", async () => {
    expect((await handlers.DELETE(request("DELETE", {}))).status).toBe(400);
    expect((await handlers.DELETE(request("DELETE", { endpoint: 5 }))).status).toBe(400);
    expect((await handlers.DELETE(request("DELETE", { endpoint: "x" }, "text/plain"))).status).toBe(415);
  });
});
