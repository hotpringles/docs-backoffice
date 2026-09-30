import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { claimCommit, docsChangedPayload, notifyDocsChanged, notifyDocsChangedIfConfigured, releaseCommit } from "./notify-docs";
import type { PushDepsResult, Sender } from "./send";
import { saveSubscription, type PushSubscriptionInput } from "./subscriptions";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

const sub = (n: number): PushSubscriptionInput => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: "B".repeat(87),
  auth: "a".repeat(22),
});
const quiet = () => ({
  warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
  error: vi.spyOn(console, "error").mockImplementation(() => undefined),
});
const commitRows = async () => (await db.query<{ n: number }>("select count(*)::int as n from notified_commits"))[0].n;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const DOC = "frontend/docs/plan/m0-scaffolding.md";

describe("docsChangedPayload", () => {
  it("한 문서만 바뀌면 그 문서 이름을 알리고 그 문서를 연다", () => {
    expect(docsChangedPayload(SHA, [DOC])).toEqual({
      title: "문서가 업데이트됐어요",
      body: "m0-scaffolding",
      url: "/docs/frontend/docs/plan/m0-scaffolding.md",
      tag: "docs-0123456789ab",
    });
  });

  it("여러 문서면 세 개까지 이름을 보이고 나머지는 건수로 줄이며 목록을 연다", () => {
    const docs = ["a.md", "b.md", "c.md", "d.md", "e.md"].map((name) => `frontend/docs/plan/${name}`);
    const payload = docsChangedPayload(SHA, docs);
    expect(payload.body).toBe("a, b, c 외 2건");
    expect(payload.url).toBe("/");
  });

  it("Excalidraw 그림 문서도 확장자 없이 이름만 보인다", () => {
    expect(docsChangedPayload(SHA, ["frontend/docs/plan/흐름.excalidraw.md"]).body).toBe("흐름");
  });

  it("파일 이름이 아주 길어도 본문이 커지지 않는다(이름 40자, 주소가 너무 길면 목록으로)", () => {
    const long = `${"가".repeat(300)}.md`;
    const payload = docsChangedPayload(SHA, [`frontend/docs/plan/${long}`]);
    expect(payload.body).toBe(`${"가".repeat(39)}…`);
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(700);
    const deep = docsChangedPayload(SHA, [`${"폴더/".repeat(400)}a.md`]);
    expect(deep.url).toBe("/");
  });

  it("push마다 tag가 달라서 연달아 올라와도 알림이 서로 덮어쓰이지 않는다", () => {
    expect(docsChangedPayload("a".repeat(40), [DOC]).tag).not.toBe(docsChangedPayload("b".repeat(40), [DOC]).tag);
    expect(docsChangedPayload(null, [DOC]).tag).toBe("docs-updated");
  });
});

describe("claimCommit / releaseCommit", () => {
  it("처음 차지하면 true, 같은 커밋을 다시 차지하면 false다", async () => {
    expect(await claimCommit(db, SHA)).toBe(true);
    expect(await claimCommit(db, SHA)).toBe(false);
    expect(await claimCommit(db, "f".repeat(40))).toBe(true);
  });

  it("풀면 다시 차지할 수 있다", async () => {
    await claimCommit(db, SHA);
    await releaseCommit(db, SHA);
    expect(await claimCommit(db, SHA)).toBe(true);
  });

  it("동시에 차지해도 하나만 true다", async () => {
    const results = await Promise.all([claimCommit(db, SHA), claimCommit(db, SHA), claimCommit(db, SHA)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("notifyDocsChanged", () => {
  it("바뀐 문서가 없으면 보내지 않고 기록도 남기지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    expect(await notifyDocsChanged({ db, sender }, { commitSha: SHA, changedDocs: [] })).toEqual({ status: "skipped-no-docs" });
    expect(sender).not.toHaveBeenCalled();
    expect(await commitRows()).toBe(0);
  });

  it("구독자 전체에게 한 번 보내고, 같은 커밋(webhook 다시 보내기 포함)은 다시 보내지 않는다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const sender = vi.fn<Sender>(async () => undefined);

    const first = await notifyDocsChanged({ db, sender }, { commitSha: SHA, changedDocs: [DOC] });
    const second = await notifyDocsChanged({ db, sender }, { commitSha: SHA, changedDocs: [DOC] });

    expect(first).toEqual({ status: "sent", summary: { total: 2, sent: 2, removed: 0, failed: 0 }, released: false });
    expect(second).toEqual({ status: "skipped-duplicate" });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sender.mock.calls[0][1])).toMatchObject({ title: "문서가 업데이트됐어요", body: "m0-scaffolding" });
  });

  it("다른 커밋은 각각 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChanged({ db, sender }, { commitSha: "a".repeat(40), changedDocs: [DOC] });
    await notifyDocsChanged({ db, sender }, { commitSha: "b".repeat(40), changedDocs: [DOC] });
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("커밋 번호를 모르면(본문에 after가 없음) 중복 방지 없이 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChanged({ db, sender }, { commitSha: null, changedDocs: [DOC] });
    await notifyDocsChanged({ db, sender }, { commitSha: null, changedDocs: [DOC] });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(await commitRows()).toBe(0);
  });

  it("구독자가 있는데 전부 실패하면 기록을 풀어서 GitHub의 Redeliver로 다시 시도할 수 있다", async () => {
    quiet();
    await saveSubscription(db, sub(1));
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };
    const first = await notifyDocsChanged({ db, sender: broken }, { commitSha: SHA, changedDocs: [DOC] });
    expect(first).toMatchObject({ status: "sent", released: true });
    expect(await commitRows()).toBe(0);

    const working = vi.fn<Sender>(async () => undefined);
    expect(await notifyDocsChanged({ db, sender: working }, { commitSha: SHA, changedDocs: [DOC] })).toMatchObject({ status: "sent", released: false });
    expect(working).toHaveBeenCalledTimes(1);
  });

  it("구독 목록을 읽다 오류가 나면 기록을 풀고 오류를 그대로 던진다", async () => {
    await saveSubscription(db, sub(1));
    let failing = true;
    const flaky: Db = {
      query: async (text, params) => {
        if (failing && text.includes("push_subscriptions")) throw new Error("neon blip");
        return db.query(text, params);
      },
    };
    const sender = vi.fn<Sender>(async () => undefined);

    await expect(notifyDocsChanged({ db: flaky, sender }, { commitSha: SHA, changedDocs: [DOC] })).rejects.toThrow("neon blip");
    expect(await commitRows()).toBe(0);

    failing = false;
    expect(await notifyDocsChanged({ db: flaky, sender }, { commitSha: SHA, changedDocs: [DOC] })).toMatchObject({ status: "sent" });
  });

  it("구독자가 없거나, 일부만 받았거나, 만료된 구독만 정리했으면 기록을 남긴다(다시 보내면 중복이다)", async () => {
    quiet();
    const sender = vi.fn<Sender>(async () => undefined);
    expect(await notifyDocsChanged({ db, sender }, { commitSha: "a".repeat(40), changedDocs: [DOC] })).toMatchObject({ released: false });

    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const partial: Sender = async (subscription) => {
      if (subscription.endpoint.endsWith("device-1")) throw new Error("boom");
    };
    expect(await notifyDocsChanged({ db, sender: partial }, { commitSha: "b".repeat(40), changedDocs: [DOC] })).toMatchObject({ released: false });

    const gone: Sender = async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    expect(await notifyDocsChanged({ db, sender: gone }, { commitSha: "c".repeat(40), changedDocs: [DOC] })).toMatchObject({ released: false });
    expect(await commitRows()).toBe(3);
  });
});

describe("notifyDocsChangedIfConfigured", () => {
  const input = { commitSha: SHA, changedDocs: [DOC] };

  it("푸시 설정이 부족하면 보내지 않고 무엇이 없는지 로그만 남긴다", async () => {
    const { warn } = quiet();
    const loadDeps = (): PushDepsResult => ({ ok: false, missing: ["DATABASE_URL"] });
    await expect(notifyDocsChangedIfConfigured(loadDeps, input)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("DATABASE_URL");
  });

  it("설정이 있으면 구독자에게 보낸다", async () => {
    const { error } = quiet();
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChangedIfConfigured(() => ({ ok: true, deps: { db, sender } }), input);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("아무에게도 보내지 못해도 던지지 않고 오류를 로그로 남긴다", async () => {
    const { error } = quiet();
    await saveSubscription(db, sub(1));
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };
    await expect(notifyDocsChangedIfConfigured(() => ({ ok: true, deps: { db, sender: broken } }), input)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it("설정을 읽다 예외가 나도 던지지 않는다(응답 뒤 작업이라 잡아 줄 곳이 없다)", async () => {
    const { error } = quiet();
    const loadDeps = (): PushDepsResult => {
      throw new Error("boom");
    };
    await expect(notifyDocsChangedIfConfigured(loadDeps, input)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
