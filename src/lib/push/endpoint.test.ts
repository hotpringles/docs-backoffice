import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./endpoint";

describe("isAllowedPushEndpoint", () => {
  it("실제 푸시 서비스의 주소는 허용한다", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://fcm.googleapis.com/wp/xyz",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QAbc123",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("http, 내부 주소, 임의 도메인은 거부한다", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://example.com/push",
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.5/push",
      "https://[::1]/push",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("허용 도메인을 흉내 내는 주소는 거부한다", () => {
    for (const url of [
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com/x",
      "https://fcm-googleapis.com/x",
      "https://notify.windows.com.evil.example/x",
      "https://x.notify.windows.com.evil.example/x",
      "https://evil.example/push.apple.com",
      "https://push.apple.com.evil.example/x",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("사용자 정보(@)나 다른 포트가 든 주소는 거부한다", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com@evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });

  it("문자열이 아니거나 비었거나 너무 길거나 URL이 아니면 거부한다", () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(null)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
    expect(isAllowedPushEndpoint("")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(2000)}`)).toBe(false);
  });

  it("대문자 호스트도 같은 주소로 본다", () => {
    expect(isAllowedPushEndpoint("https://FCM.GOOGLEAPIS.COM/fcm/send/abc")).toBe(true);
  });
});
