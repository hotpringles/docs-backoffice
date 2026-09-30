import { describe, expect, it } from "vitest";
import { deleteEvent, login, logout, saveEvent } from "./client";

type Recorded = { url: string; init: RequestInit | undefined };

function fakeFetch(respond: (url: string) => Response | Error) {
  const requests: Recorded[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    const result = respond(url);
    if (result instanceof Error) throw result;
    return result;
  }) as unknown as typeof fetch;
  return { impl, requests };
}

const ok = (body: unknown = { ok: true }, status = 200) => new Response(JSON.stringify(body), { status });

describe("login / logout", () => {
  it("코드를 JSON POST로 보내고 성공을 알린다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    expect(await login(impl, "my-code")).toEqual({ ok: true, data: { ok: true } });
    expect(requests[0].url).toBe("/api/auth/login");
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ code: "my-code" });
  });

  it("틀린 코드(401)와 잠금(429)의 메시지와 남은 분을 그대로 돌려준다", async () => {
    const wrong = await login(fakeFetch(() => ok({ error: "코드가 맞지 않아요." }, 401)).impl, "x");
    expect(wrong).toEqual({ ok: false, status: 401, message: "코드가 맞지 않아요." });

    const locked = await login(fakeFetch(() => ok({ error: "시도가 너무 많아요. 7분 뒤에 다시 시도해 주세요.", retryAfterMinutes: 7 }, 429)).impl, "x");
    expect(locked).toMatchObject({ ok: false, status: 429, retryAfterMinutes: 7 });
  });

  it("로그아웃도 POST다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    await logout(impl);
    expect(requests[0].url).toBe("/api/auth/logout");
    expect(requests[0].init?.method).toBe("POST");
  });
});

describe("saveEvent / deleteEvent", () => {
  it("새 일정은 /api/events, 수정은 /api/events/번호로 보낸다", async () => {
    const { impl, requests } = fakeFetch(() => ok({ id: 9 }, 201));
    expect(await saveEvent(impl, null, { title: "a" })).toEqual({ ok: true, data: { id: 9 } });
    await saveEvent(impl, 7, { title: "b" });
    expect(requests.map((r) => r.url)).toEqual(["/api/events", "/api/events/7"]);
    expect(requests.every((r) => r.init?.method === "POST")).toBe(true);
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({ title: "b" });
  });

  it("검증 실패(400)는 필드별 메시지를 돌려준다", async () => {
    const { impl } = fakeFetch(() => ok({ error: "입력을 확인해 주세요.", errors: { title: "제목을 입력해 주세요." } }, 400));
    expect(await saveEvent(impl, null, {})).toEqual({
      ok: false,
      status: 400,
      message: "입력을 확인해 주세요.",
      fieldErrors: { title: "제목을 입력해 주세요." },
    });
  });

  it("삭제는 /api/events/번호/delete로 POST한다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    expect((await deleteEvent(impl, 4)).ok).toBe(true);
    expect(requests[0].url).toBe("/api/events/4/delete");
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({});
  });

  it("401은 상태 코드로 구분할 수 있다(코드를 다시 물어야 한다)", async () => {
    const { impl } = fakeFetch(() => ok({ error: "편집 코드를 먼저 입력해 주세요." }, 401));
    expect(await saveEvent(impl, null, {})).toMatchObject({ ok: false, status: 401 });
  });
});

describe("오류 처리", () => {
  it("네트워크가 끊기면 던지지 않고 status 0으로 알린다", async () => {
    const { impl } = fakeFetch(() => new Error("offline"));
    const result = await saveEvent(impl, null, {});
    expect(result).toMatchObject({ ok: false, status: 0 });
    if (!result.ok) expect(result.message).toContain("네트워크");
  });

  it("응답이 JSON이 아니어도 기본 문구로 알린다", async () => {
    const { impl } = fakeFetch(() => new Response("<html>oops</html>", { status: 500 }));
    const result = await deleteEvent(impl, 1);
    expect(result).toMatchObject({ ok: false, status: 500 });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it("성공 응답 본문이 비어 있어도 죽지 않는다", async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 200 }));
    expect((await logout(impl)).ok).toBe(true);
  });
});
