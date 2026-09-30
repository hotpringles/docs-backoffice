import { guardedWrite, type GuardContext, type GuardDeps } from "@/lib/guard";
import { json } from "@/lib/http";
import { createEvent, deleteEvent, updateEvent } from "./store";
import { validateEventInput } from "./validate";

export type EventDeps = GuardDeps;

/** 1~999,999,999. 앞에 0이 붙거나 소수, 음수, 문자가 섞인 값은 없는 일정으로 본다. */
const EVENT_ID = /^[1-9]\d{0,8}$/;

const notFound = () => json({ error: "일정을 찾을 수 없어요." }, 404);
const invalid = (errors: unknown) => json({ error: "입력을 확인해 주세요.", errors }, 400);

export function createEventHandlers(deps: EventDeps) {
  /** 편집 권한 → JSON 본문 → 명단 → DB 순으로 확인한 뒤 실행한다(`guardedWrite`). */
  const guarded = (request: Request, run: (context: GuardContext) => Promise<Response>) =>
    guardedWrite(deps, request, run, { failureLog: "일정을 저장하다 데이터베이스 오류가 났어요" });

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
