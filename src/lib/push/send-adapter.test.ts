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

  it("web-push가 던진 오류(statusCode 포함)를 그대로 던진다", async () => {
    const error = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotification.mockRejectedValue(error);
    await expect(createWebPushSender(vapid)(subscription, "{}")).rejects.toBe(error);
  });
});
