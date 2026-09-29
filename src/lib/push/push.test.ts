import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import { notifyDocsChanged } from "./notify-docs";
import { docsChangedPayload } from "./payload";
import { sendToAll, type Sender } from "./send";
import { listSubscriptions, saveSubscription, type PushSubscriptionInput } from "./subscriptions";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const sub = (n: number): PushSubscriptionInput => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: P256DH,
  auth: AUTH,
});

describe("docsChangedPayload", () => {
  it("한 문서만 바뀌면 그 문서 주소를 열고 파일 이름을 본문에 넣는다", () => {
    expect(docsChangedPayload(["frontend/docs/plan/m3-routing.md"])).toEqual({
      title: "문서가 업데이트됐어요",
      body: "m3-routing",
      url: "/docs/frontend/docs/plan/m3-routing.md",
      tag: "docs-updated",
    });
  });

  it("여러 문서면 세 개까지 이름을 넣고 나머지는 '외 N건'으로 줄이며 목록을 연다", () => {
    const payload = docsChangedPayload(["d/a.md", "d/b.md", "d/c.md", "d/d.md", "d/e.md"]);
    expect(payload.body).toBe("a, b, c 외 2건");
    expect(payload.url).toBe("/");
  });

  it("세 개 이하면 '외'가 붙지 않고, 그림 파일은 .excalidraw.md를 뗀 이름이다", () => {
    expect(docsChangedPayload(["d/a.md", "d/그림.excalidraw.md"]).body).toBe("a, 그림");
  });

  it("아주 긴 파일 이름과 경로도 웹 푸시 본문 제한(약 4KB)을 넘지 않는다", () => {
    const long = `d/${"가".repeat(300)}.md`;
    const payload = docsChangedPayload([long, long, long, long]);
    expect(payload.body.length).toBeLessThanOrEqual(150);
    expect(payload.body).toContain("…");
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(1000);

    const single = docsChangedPayload([long]);
    expect(single.url).toBe("/"); // 주소가 너무 길면 문서 목록을 연다.
    expect(new TextEncoder().encode(JSON.stringify(single)).length).toBeLessThan(1000);
  });

  it("공백과 한글이 든 경로도 주소로 인코딩한다", () => {
    expect(docsChangedPayload(["d/Manager's 흐름.md"]).url).toBe("/docs/d/Manager's%20%ED%9D%90%EB%A6%84.md");
  });
});

describe("sendToAll / notifyDocsChanged", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await close();
  });

  const payload = docsChangedPayload(["d/a.md"]);

  it("모든 구독자에게 JSON 본문을 보낸다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const calls: [string, string][] = [];
    const sender: Sender = async (s, body) => {
      calls.push([s.endpoint, body]);
    };

    const summary = await sendToAll(db, sender, payload);

    expect(summary).toEqual({ total: 2, sent: 2, removed: 0, failed: 0 });
    expect(calls.map(([endpoint]) => endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(JSON.parse(calls[0][1])).toEqual(payload);
  });

  it("404, 410으로 사라진 구독은 지우고, 다른 실패는 세기만 하고 나머지는 계속 보낸다", async () => {
    for (const n of [1, 2, 3, 4]) await saveSubscription(db, sub(n));
    const sender: Sender = async (s) => {
      if (s.endpoint.endsWith("device-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("device-2")) throw Object.assign(new Error("not found"), { statusCode: 404 });
      if (s.endpoint.endsWith("device-3")) throw Object.assign(new Error("server error"), { statusCode: 500 });
    };

    const summary = await sendToAll(db, sender, payload);

    expect(summary).toEqual({ total: 4, sent: 1, removed: 2, failed: 1 });
    expect((await listSubscriptions(db)).map((s) => s.endpoint).sort()).toEqual([sub(3).endpoint, sub(4).endpoint]);
  });

  it("상태 코드가 없는 오류(네트워크 실패 등)는 구독을 지우지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender: Sender = async () => {
      throw new Error("network down");
    };
    const summary = await sendToAll(db, sender, payload);
    expect(summary).toEqual({ total: 1, sent: 0, removed: 0, failed: 1 });
    expect(await listSubscriptions(db)).toHaveLength(1);
  });

  it("구독자가 없으면 아무것도 보내지 않는다", async () => {
    const sender = vi.fn<Sender>();
    expect(await sendToAll(db, sender, payload)).toEqual({ total: 0, sent: 0, removed: 0, failed: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("구독자가 많아도(25명) 모두에게 보낸다", async () => {
    for (let i = 0; i < 25; i++) await saveSubscription(db, sub(i));
    const sender = vi.fn<Sender>(async () => undefined);
    expect((await sendToAll(db, sender, payload)).sent).toBe(25);
    expect(sender).toHaveBeenCalledTimes(25);
  });

  it("바뀐 문서가 없으면 보내지 않고 커밋도 기록하지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>();
    expect(await notifyDocsChanged({ db, sender }, { commitSha: "abc", changedDocs: [] })).toEqual({
      status: "skipped-no-docs",
    });
    expect(sender).not.toHaveBeenCalled();
    expect(await db.query("select sha from notified_commits")).toEqual([]);
  });

  it("같은 커밋은 한 번만 보낸다 (webhook 재전송)", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    const input = { commitSha: "abc123", changedDocs: ["d/a.md"] };

    const first = await notifyDocsChanged({ db, sender }, input);
    const second = await notifyDocsChanged({ db, sender }, input);

    expect(first.status).toBe("sent");
    expect(second).toEqual({ status: "skipped-duplicate" });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("다른 커밋은 각각 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChanged({ db, sender }, { commitSha: "one", changedDocs: ["d/a.md"] });
    await notifyDocsChanged({ db, sender }, { commitSha: "two", changedDocs: ["d/a.md"] });
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("커밋 SHA가 없으면 중복 검사 없이 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChanged({ db, sender }, { commitSha: null, changedDocs: ["d/a.md"] });
    await notifyDocsChanged({ db, sender }, { commitSha: null, changedDocs: ["d/a.md"] });
    expect(sender).toHaveBeenCalledTimes(2);
  });
});
