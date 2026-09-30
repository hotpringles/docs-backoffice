import { describe, expect, it } from "vitest";
import { loadAuthorOrNull } from "./author";

const creator = { login: "letsgojh", name: "유재환" };
const later = <T,>(ms: number, run: () => T) => new Promise<T>((resolve, reject) => setTimeout(() => { try { resolve(run()); } catch (e) { reject(e); } }, ms));

describe("loadAuthorOrNull", () => {
  it("제때 오면 작성자를 그대로 돌려준다", async () => {
    expect(await loadAuthorOrNull(async () => creator, 200)).toEqual(creator);
  });

  it("조회가 실패하면(한도 초과, 네트워크 오류 등) 오류를 던지지 않고 null이다", async () => {
    expect(
      await loadAuthorOrNull(async () => {
        throw new Error("GitHub API 403");
      }, 200),
    ).toBeNull();
  });

  it("정해진 시간 안에 못 오면 기다리지 않고 null이다(문서 보기가 느려지지 않게)", async () => {
    const started = Date.now();
    expect(await loadAuthorOrNull(() => later(400, () => creator), 30)).toBeNull();
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("기록이 없다는 답(null)도 그대로 null이다", async () => {
    expect(await loadAuthorOrNull(async () => null, 200)).toBeNull();
  });
});
