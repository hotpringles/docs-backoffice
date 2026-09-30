import { requireEditSession } from "@/lib/auth/handlers";
import type { Db } from "@/lib/db/types";
import { json, readJsonBody } from "@/lib/http";
import { loadPeople, type Person } from "@/lib/people";
import { createEvent, deleteEvent, updateEvent } from "./store";
import { validateEventInput } from "./validate";

type Env = Record<string, string | undefined>;

export type EventDeps = {
  getDb: () => Db | null;
  env: () => Env;
  now: () => Date;
};

type Context = { db: Db; body: unknown; people: Person[] };

/** 1~999,999,999. 앞에 0이 붙거나 소수, 음수, 문자가 섞인 값은 없는 일정으로 본다. */
const EVENT_ID = /^[1-9]\d{0,8}$/;

const notFound = () => json({ error: "일정을 찾을 수 없어요." }, 404);
const invalid = (errors: unknown) => json({ error: "입력을 확인해 주세요.", errors }, 400);

export function createEventHandlers(deps: EventDeps) {
  /** 편집 권한 → JSON 본문 → 명단 → DB 순으로 확인한 뒤 실행한다. 인증이 가장 먼저라서 권한 없는 요청에는 검증 정보를 알려주지 않는다. */
  async function guarded(request: Request, run: (context: Context) => Promise<Response>): Promise<Response> {
    const session = requireEditSession(request, deps.env(), deps.now());
    if (!session.ok) return session.response;

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const people = loadPeople(deps.env());
    if (!people.ok) return json({ error: people.error }, 503);

    const db = deps.getDb();
    if (!db) return json({ error: "데이터베이스가 설정되지 않았어요." }, 503);

    try {
      return await run({ db, body: parsed.body, people: people.people });
    } catch (error) {
      console.error("일정을 저장하다 데이터베이스 오류가 났어요", error);
      return json({ error: "데이터베이스에 연결하지 못했어요." }, 503);
    }
  }

  return {
    create(request: Request): Promise<Response> {
      return guarded(request, async ({ db, body, people }) => {
        const result = validateEventInput(body, people);
        if (!result.ok) return invalid(result.errors);
        return json({ id: await createEvent(db, result.value) }, 201);
      });
    },

    update(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db, body, people }) => {
        if (!EVENT_ID.test(rawId)) return notFound();
        const result = validateEventInput(body, people);
        if (!result.ok) return invalid(result.errors);
        return (await updateEvent(db, Number(rawId), result.value)) ? json({ ok: true }) : notFound();
      });
    },

    remove(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db }) => {
        if (!EVENT_ID.test(rawId)) return notFound();
        return (await deleteEvent(db, Number(rawId))) ? json({ ok: true }) : notFound();
      });
    },
  };
}
