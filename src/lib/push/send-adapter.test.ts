import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification } }));

const { createWebPushSender } = await import("./send");

const vapid = { subject: "mailto:team@example.com", publicKey: "pub", privateKey: "priv" };
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "P256DH", auth: "AUTH" };

describe("createWebPushSender", () => {
  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  });

  it("구독 모양과 본문, 옵션(VAPID, 하루 TTL)을 web-push에 그대로 넘긴다", async () => {
    await createWebPushSender(vapid)(subscription, '{"title":"t"}');

    expect(sendNotification).toHaveBeenCalledExactlyOnceWith(
      { endpoint: subscription.endpoint, keys: { p256dh: "P256DH", auth: "AUTH" } },
      '{"title":"t"}',
      {
        TTL: 86_400,
        urgency: "normal",
        timeout: 10_000,
        vapidDetails: { subject: vapid.subject, publicKey: "pub", privateKey: "priv" },
      },
    );
  });

  it("허용된 푸시 서비스가 아닌 주소로는 web-push를 부르지 않는다(저장소에 잘못 들어온 값에 대한 마지막 방어선)", async () => {
    for (const endpoint of ["https://evil.example/x", "https://10.0.0.1`.web.push.apple.com/x", "http://fcm.googleapis.com/x"]) {
      await expect(createWebPushSender(vapid)({ ...subscription, endpoint }, "{}")).rejects.toThrow("허용되지 않는 푸시 주소");
    }
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("web-push가 던진 오류(statusCode 포함)를 그대로 던진다", async () => {
    const error = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotification.mockRejectedValue(error);
    await expect(createWebPushSender(vapid)(subscription, "{}")).rejects.toBe(error);
  });
});
