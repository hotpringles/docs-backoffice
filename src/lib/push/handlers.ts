import type { Db } from "@/lib/db/types";
import { MAX_ENDPOINT_LENGTH } from "./endpoint";
import { parseSubscription, removeSubscription, saveSubscription } from "./subscriptions";

type Deps = { getDb: () => Db | null };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

/** 본문이 JSON이어야 한다. (다른 사이트의 폼이 몰래 보내는 요청은 JSON 헤더를 못 붙이므로 여기서 걸러진다.) */
async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { ok: false, response: json({ error: "Content-Type은 application/json이어야 해요." }, 415) };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ error: "본문이 올바른 JSON이 아니에요." }, 400) };
  }
}

/** 알림 구독 등록(POST)과 해제(DELETE). 로그인이 없어서 누구나 부를 수 있다. */
export function createSubscriptionHandlers({ getDb }: Deps) {
  return {
    async POST(request: Request): Promise<Response> {
      const parsed = await readJson(request);
      if (!parsed.ok) return parsed.response;

      const subscription = parseSubscription(parsed.body);
      if (!subscription.ok) return json({ error: subscription.error }, 400);

      const db = getDb();
      if (!db) return json({ error: "알림 저장소가 설정되지 않았어요." }, 503);

      const result = await saveSubscription(db, subscription.value);
      if (result === "limit") return json({ error: "구독할 수 있는 기기 수를 넘었어요." }, 429);
      return json({ ok: true }, result === "created" ? 201 : 200);
    },

    async DELETE(request: Request): Promise<Response> {
      const parsed = await readJson(request);
      if (!parsed.ok) return parsed.response;

      const endpoint = (parsed.body as { endpoint?: unknown } | null)?.endpoint;
      if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
        return json({ error: "endpoint가 필요해요." }, 400);
      }

      const db = getDb();
      if (!db) return json({ error: "알림 저장소가 설정되지 않았어요." }, 503);

      await removeSubscription(db, endpoint);
      return new Response(null, { status: 204 });
    },
  };
}
