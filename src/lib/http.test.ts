import { describe, expect, it } from "vitest";
import { json, readJsonBody } from "./http";

const post = (body: BodyInit | null, contentType?: string) =>
  new Request("http://localhost/x", { method: "POST", body, headers: contentType ? { "content-type": contentType } : {} });

describe("json", () => {
  it("상태 코드와 헤더를 붙여 JSON으로 응답한다", async () => {
    const response = json({ a: 1 }, 201, { "x-test": "1" });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("1");
    expect(await response.json()).toEqual({ a: 1 });
  });
});

describe("readJsonBody", () => {
  it("application/json이면 본문을 읽는다(대소문자와 charset은 무시)", async () => {
    for (const type of ["application/json", "Application/JSON", "application/json; charset=utf-8"]) {
      expect(await readJsonBody(post('{"a":1}', type)), type).toEqual({ ok: true, body: { a: 1 } });
    }
  });

  it("다른 Content-Type이면 415다(다른 사이트의 폼 전송 등)", async () => {
    for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded", "application/json-patch+json", "multipart/form-data"]) {
      const result = await readJsonBody(post('{"a":1}', type));
      expect(result.ok, String(type)).toBe(false);
      if (!result.ok) expect(result.response.status, String(type)).toBe(415);
    }
  });

  it("깨진 JSON은 400이다", async () => {
    const result = await readJsonBody(post("{oops", "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("20KB가 넘는 본문은 413이다", async () => {
    const big = JSON.stringify({ memo: "가".repeat(20_001) });
    const result = await readJsonBody(post(big, "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("JSON 값이 배열이나 null이어도 그대로 돌려준다(검사는 받는 쪽이 한다)", async () => {
    expect(await readJsonBody(post("null", "application/json"))).toEqual({ ok: true, body: null });
    expect(await readJsonBody(post("[1]", "application/json"))).toEqual({ ok: true, body: [1] });
  });
});
