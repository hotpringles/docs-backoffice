import { parse as parseLegacy } from "node:url";
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

  // 검증은 WHATWG `new URL`로 하지만, web-push는 같은 문자열을 옛 `url.parse`로 다시 읽어 그 호스트로 연결한다.
  // 두 파서가 호스트를 다르게 읽는 주소는 검증을 통과한 뒤 다른 곳으로 요청이 나가므로 모두 거부해야 한다.
  it("두 URL 파서가 호스트를 다르게 읽는 주소는 거부한다", () => {
    for (const url of [
      "https://10.0.0.1`.web.push.apple.com/x",
      "https://evil.example`.web.push.apple.com/x",
      "https://169.254.169.254'.notify.windows.com/x",
      "https://evil.example\t.web.push.apple.com/x",
      "https://evil.example\n.web.push.apple.com/x",
      "https://fcm.googleapis.com\\@evil.example/x",
      "https://evil.example%2eweb.push.apple.com/x",
      "https://evil.example­.web.push.apple.com/x",
      "https://evil.example．web.push.apple.com/x",
      "https:///fcm.googleapis.com/x",
      "https://fcm.googleapis.com./x",
    ]) {
      expect(isAllowedPushEndpoint(url), JSON.stringify(url)).toBe(false);
    }
  });

  it("허용된 주소는 web-push가 연결할 호스트와 검증한 호스트가 언제나 같다", () => {
    // web-push가 쓰는 옛 url.parse는 호출할 때 경고를 찍으므로, 이 테스트에서만 끈다.
    const previous = process.noDeprecation;
    process.noDeprecation = true;
    try {
      const prefixes = ["https://", "https://evil.example", "https://10.0.0.1", "https://fcm.googleapis.com"];
      const suffixes = [".web.push.apple.com/x", ".notify.windows.com/x", "/x", ".googleapis.com/x"];
      let accepted = 0;
      for (let code = 0; code < 0x100; code += 1) {
        const ch = String.fromCharCode(code);
        for (const prefix of prefixes) {
          for (const suffix of suffixes) {
            for (const raw of [`${prefix}${ch}${suffix}`, `${prefix}${suffix}${ch}`, `${prefix.replace("//", `//${ch}`)}${suffix}`]) {
              if (!isAllowedPushEndpoint(raw)) continue;
              accepted += 1;
              expect(parseLegacy(raw).hostname, JSON.stringify(raw)).toBe(new URL(raw).hostname);
            }
          }
        }
      }
      expect(accepted).toBeGreaterThan(0); // 허용 쪽 경로도 실제로 돌았는지 확인한다.
    } finally {
      process.noDeprecation = previous;
    }
  });
});
