import { describe, expect, it } from "vitest";
import { clientIp, hashIp } from "./ip";

describe("clientIp", () => {
  it("x-forwarded-for의 첫 값을 쓴다", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.5 " }))).toBe("203.0.113.5");
  });

  it("없으면 x-real-ip, 그것도 없으면 unknown이다", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
  });

  it("아주 긴 값은 잘라서 쓴다", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "a".repeat(500) })).length).toBeLessThanOrEqual(100);
  });
});

describe("hashIp", () => {
  it("같은 입력은 같은 값이고, 비밀키가 다르면 다른 값이며, 원래 IP는 드러나지 않는다", () => {
    const one = hashIp("203.0.113.5", "secret-a".repeat(3));
    expect(hashIp("203.0.113.5", "secret-a".repeat(3))).toBe(one);
    expect(hashIp("203.0.113.5", "secret-b".repeat(3))).not.toBe(one);
    expect(hashIp("203.0.113.6", "secret-a".repeat(3))).not.toBe(one);
    expect(one).toMatch(/^[0-9a-f]{32}$/);
    expect(one).not.toContain("203");
  });
});
