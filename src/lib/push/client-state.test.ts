import { describe, expect, it } from "vitest";
import { detectPushSupport, urlBase64ToUint8Array, type PushEnv } from "./client-state";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
const DESKTOP_MAC = IPAD_AS_MAC;

const supported: PushEnv = {
  userAgent: ANDROID,
  maxTouchPoints: 5,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
};
const env = (overrides: Partial<PushEnv>): PushEnv => ({ ...supported, ...overrides });

describe("detectPushSupport", () => {
  it("모든 API가 있고 권한이 아직 결정되지 않았으면 ready", () => {
    expect(detectPushSupport(supported)).toBe("ready");
    expect(detectPushSupport(env({ permission: "granted" }))).toBe("ready");
  });

  it("사용자가 차단했으면 denied", () => {
    expect(detectPushSupport(env({ permission: "denied" }))).toBe("denied");
  });

  it("필요한 API가 하나라도 없으면 unsupported", () => {
    expect(detectPushSupport(env({ hasServiceWorker: false }))).toBe("unsupported");
    expect(detectPushSupport(env({ hasPushManager: false }))).toBe("unsupported");
    expect(detectPushSupport(env({ hasNotification: false }))).toBe("unsupported");
  });

  it("iPhone의 Safari 탭(홈 화면에 추가하지 않음)은 API가 없어도 '홈 화면에 추가' 안내가 먼저다", () => {
    const safariTab = env({
      userAgent: IPHONE,
      hasPushManager: false,
      hasNotification: false,
      permission: "unsupported",
    });
    expect(detectPushSupport(safariTab)).toBe("ios-needs-install");
  });

  it("iPad(Mac처럼 보이는 user agent + 터치)도 iOS로 본다", () => {
    expect(detectPushSupport(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe("ios-needs-install");
  });

  it("터치가 없는 진짜 Mac은 iOS가 아니다", () => {
    expect(detectPushSupport(env({ userAgent: DESKTOP_MAC, maxTouchPoints: 0 }))).toBe("ready");
  });

  it("iPhone에서 홈 화면에 추가한 앱(standalone)으로 열면 일반 판별로 넘어간다", () => {
    expect(detectPushSupport(env({ userAgent: IPHONE, standalone: true }))).toBe("ready");
    expect(detectPushSupport(env({ userAgent: IPHONE, standalone: true, permission: "denied" }))).toBe("denied");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("패딩이 없는 base64url을 바이트로 바꾼다", () => {
    // "hello?>" = aGVsbG8/Pg== (표준 base64) → base64url은 aGVsbG8_Pg (패딩 없음, /가 _로)
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8_Pg"))).toEqual([104, 101, 108, 108, 111, 63, 62]);
  });

  it("- 와 _ 를 + 와 / 로 되돌려서 읽는다", () => {
    // 바이트 [251, 255, 190]은 표준 base64로 "+/++", base64url로 "-_--"
    expect(Array.from(urlBase64ToUint8Array("-_--"))).toEqual([251, 255, 190]);
  });

  it("실제 VAPID 공개키(87자)는 65바이트가 되고 첫 바이트는 0x04(비압축 P-256)다", () => {
    const key = "BBpuX8Dc27tDCRJZGNdF_r3i8PXVBddskKblLrI8KR7PPHoCx4aYwvE7jjz97Spr5KJeo_me8wNk1mqf-QrT2sg";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it("빈 문자열은 빈 바이트", () => {
    expect(urlBase64ToUint8Array("")).toHaveLength(0);
  });
});
