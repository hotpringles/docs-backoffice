import { postJson } from "@/lib/events/client";

/** 모임 만들기(편집 코드 필요). */
export const createMeetup = (fetchImpl: typeof fetch, payload: Record<string, unknown>) =>
  postJson<{ id: number }>(fetchImpl, "/api/meetups", payload);

/** 모임 지우기(편집 코드 필요). */
export const deleteMeetup = (fetchImpl: typeof fetch, id: number) => postJson<{ ok: true }>(fetchImpl, `/api/meetups/${id}/delete`, {});

/** 시간 확정(편집 코드 필요). 일정이 만들어진다. */
export const confirmMeetup = (fetchImpl: typeof fetch, id: number, payload: Record<string, unknown>) =>
  postJson<{ eventId: number; day: string }>(fetchImpl, `/api/meetups/${id}/confirm`, payload);

/** 가능한 시간 저장(편집 코드 필요 없음). `cells`는 "2026-10-07:4" 모양의 칸 키 목록이고, 그 사람의 칸이 통째로 바뀐다. */
export const saveAvailability = (fetchImpl: typeof fetch, id: number, personId: string, cells: string[]) =>
  postJson<{ ok: true; count: number }>(fetchImpl, `/api/meetups/${id}/availability`, { personId, cells });
