import { describe, expect, it } from "vitest";
import { confirmMeetup, createMeetup, deleteMeetup, saveAvailability } from "./client";

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

describe("모임 API 호출", () => {
  it("모임 만들기는 /api/meetups로 JSON POST한다", async () => {
    const { impl, requests } = fakeFetch(() => ok({ id: 3 }, 201));
    expect(await createMeetup(impl, { title: "a", startDate: "2026-10-07" })).toEqual({ ok: true, data: { id: 3 } });
    expect(requests[0].url).toBe("/api/meetups");
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ title: "a", startDate: "2026-10-07" });
  });

  it("검증 실패(400)는 필드별 메시지를 돌려준다(모임의 필드 이름 그대로)", async () => {
    const { impl } = fakeFetch(() => ok({ error: "입력을 확인해 주세요.", errors: { dates: "날짜가 틀려요." } }, 400));
    expect(await createMeetup(impl, {})).toEqual({ ok: false, status: 400, message: "입력을 확인해 주세요.", fieldErrors: { dates: "날짜가 틀려요." } });
  });

  it("삭제와 확정은 모임 번호가 든 주소로 보낸다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    await deleteMeetup(impl, 4);
    await confirmMeetup(impl, 4, { day: "2026-10-07", startTime: "10:00", endTime: "11:00" });
    expect(requests.map((r) => r.url)).toEqual(["/api/meetups/4/delete", "/api/meetups/4/confirm"]);
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({});
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({ day: "2026-10-07", startTime: "10:00", endTime: "11:00" });
  });

  it("가능한 시간 저장은 이름과 칸 키 목록을 보낸다", async () => {
    const { impl, requests } = fakeFetch(() => ok({ ok: true, count: 2 }));
    expect(await saveAvailability(impl, 4, "p2", ["2026-10-07:0", "2026-10-07:1"])).toEqual({ ok: true, data: { ok: true, count: 2 } });
    expect(requests[0].url).toBe("/api/meetups/4/availability");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ personId: "p2", mode: "available", cells: ["2026-10-07:0", "2026-10-07:1"] });
  });

  it("401(편집 코드), 409(이미 확정)는 상태 코드로 구분할 수 있다", async () => {
    const unauthorized = fakeFetch(() => ok({ error: "편집 코드를 먼저 입력해 주세요." }, 401));
    expect(await confirmMeetup(unauthorized.impl, 1, {})).toMatchObject({ ok: false, status: 401 });
    const conflict = fakeFetch(() => ok({ error: "이미 확정된 모임이에요." }, 409));
    expect(await saveAvailability(conflict.impl, 1, "p1", [])).toMatchObject({ ok: false, status: 409, message: "이미 확정된 모임이에요." });
  });

  it("네트워크가 끊기면 던지지 않고 status 0으로 알린다", async () => {
    const { impl } = fakeFetch(() => new Error("offline"));
    expect(await saveAvailability(impl, 1, "p1", [])).toMatchObject({ ok: false, status: 0 });
  });
});
