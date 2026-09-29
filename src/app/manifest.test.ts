import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("웹 앱 manifest", () => {
  const m = manifest();

  it("iOS 푸시에 필요한 standalone 모드이고 시작 주소는 홈이다", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("192, 512 PNG 아이콘과 maskable 아이콘이 있다", () => {
    const icons = m.icons ?? [];
    expect(icons.find((i) => i.sizes === "192x192")?.src).toBe("/icon-192.png");
    expect(icons.filter((i) => i.sizes === "512x512").map((i) => i.purpose ?? "any")).toEqual(["any", "maskable"]);
    for (const icon of icons) expect(icon.type).toBe("image/png");
  });

  it("이름이 있다", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
  });
});
