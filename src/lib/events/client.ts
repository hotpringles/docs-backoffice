// 일정과 모임 API가 함께 쓰는 fetch 도우미다.

export type ApiOk<T> = { ok: true; data: T };
export type ApiError = {
  ok: false;
  /** 0이면 네트워크 오류, 401이면 편집 코드를 다시 물어야 한다. */
  status: number;
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfterMinutes?: number;
};
export type ApiResult<T> = ApiOk<T> | ApiError;

const JSON_HEADERS = { "content-type": "application/json" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** 쓰기 요청은 모두 JSON POST다. 브라우저의 fetch를 주입받아서 진짜 브라우저 없이도 시험할 수 있다. */
async function post<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, message: "네트워크에 연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }

  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: data as T };

  const record = isRecord(data) ? data : {};
  return {
    ok: false,
    status: response.status,
    message: typeof record.error === "string" ? record.error : "요청을 처리하지 못했어요.",
    ...(isRecord(record.errors) ? { fieldErrors: record.errors as Record<string, string> } : {}),
    ...(typeof record.retryAfterMinutes === "number" ? { retryAfterMinutes: record.retryAfterMinutes } : {}),
  };
}

export const login = (fetchImpl: typeof fetch, code: string) => post<{ ok: true }>(fetchImpl, "/api/auth/login", { code });

export const logout = (fetchImpl: typeof fetch) => post<{ ok: true }>(fetchImpl, "/api/auth/logout", {});

/** `id`가 null이면 새 일정, 있으면 그 일정을 고친다. */
export const saveEvent = (fetchImpl: typeof fetch, id: number | null, payload: Record<string, unknown>) =>
  post<{ id?: number }>(fetchImpl, id === null ? "/api/events" : `/api/events/${id}`, payload);

export const deleteEvent = (fetchImpl: typeof fetch, id: number) => post<{ ok: true }>(fetchImpl, `/api/events/${id}/delete`, {});

/** 모임 API 호출도 같은 방식으로 보낼 수 있게 내보낸다. */
export { post as postJson };
