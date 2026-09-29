import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { serviceWorkerHeaders } from "./headers";

describe("서비스 워커 헤더", () => {
  const [rule] = serviceWorkerHeaders();
  const value = (key: string) => rule.headers.find((h) => h.key === key)?.value;

  it("/sw.js에만 적용된다", () => {
    expect(serviceWorkerHeaders()).toHaveLength(1);
    expect(rule.source).toBe("/sw.js");
  });

  it("캐시하지 않고, 자바스크립트로 내려주고, 자기 도메인 스크립트만 허용한다", () => {
    expect(value("Cache-Control")).toContain("no-store");
    expect(value("Content-Type")).toContain("application/javascript");
    expect(value("Content-Security-Policy")).toBe("default-src 'self'; script-src 'self'");
  });

  it("next.config.ts가 이 헤더를 실제로 내보낸다", async () => {
    expect(await nextConfig.headers?.()).toEqual(serviceWorkerHeaders());
  });
});
