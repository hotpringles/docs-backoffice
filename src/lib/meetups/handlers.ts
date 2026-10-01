import { todayInSeoul } from "@/lib/events/dates";
import { guardedWrite, type GuardContext, type GuardDeps } from "@/lib/guard";
import { json } from "@/lib/http";
import type { PushDepsResult } from "@/lib/push/send";
import { meetupConfirmedPayload, meetupOpenedPayload } from "./notices";
import { notifyIfConfigured } from "./notify";
import { confirmMeetup, createMeetup, deleteMeetup, getMeetup, saveAvailability, updateMeetup } from "./store";
import { validateAvailabilityInput, validateConfirmInput, validateMeetupInput } from "./validate";

export type MeetupDeps = GuardDeps & {
  /** 응답을 돌려준 뒤에 실행할 작업을 예약한다(실제로는 `next/server`의 `after`). 알림에 쓴다. */
  runAfter: (task: () => Promise<void>) => void;
  loadPushDeps: () => PushDepsResult;
};

/** 1~999,999,999. 앞에 0이 붙거나 소수, 음수, 문자가 섞인 값은 없는 모임으로 본다. */
const MEETUP_ID = /^[1-9]\d{0,8}$/;

const notFound = () => json({ error: "모임을 찾을 수 없어요." }, 404);
const alreadyConfirmed = () => json({ error: "이미 확정된 모임이에요." }, 409);
const unavailable = () => json({ error: "이미 확정됐거나 사라진 모임이에요." }, 409);
const invalid = (errors: unknown) => json({ error: "입력을 확인해 주세요.", errors }, 400);

export function createMeetupHandlers(deps: MeetupDeps) {
  const guarded = (request: Request, run: (context: GuardContext) => Promise<Response>) =>
    guardedWrite(deps, request, run, { failureLog: "모임을 저장하다 데이터베이스 오류가 났어요" });

  return {
    /** 모임 만들기(편집 권한). 저장한 뒤 "모임 열림" 알림을 응답 뒤에 보낸다. */
    create(request: Request): Promise<Response> {
      return guarded(request, async ({ db, body }) => {
        const result = validateMeetupInput(body, todayInSeoul(deps.now()));
        if (!result.ok) return invalid(result.errors);
        const id = await createMeetup(db, result.value);
        deps.runAfter(() => notifyIfConfigured(deps.loadPushDeps, "meetup-opened", id, meetupOpenedPayload({ id, title: result.value.title })));
        return json({ id }, 201);
      });
    },

    /**
     * 열린 모임 수정(편집 권한). 제목, 후보 날짜, 하루 범위를 바꾼다. 알림은 보내지 않는다.
     * 이미 표시된 가능한 시간은 새 범위를 벗어난 것만 지우고, 하루 시작 시각이 바뀌면 칸 번호의 뜻이 달라지므로 모두 지운다.
     */
    update(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db, body }) => {
        if (!MEETUP_ID.test(rawId)) return notFound();
        const id = Number(rawId);
        const meetup = await getMeetup(db, id);
        if (!meetup) return notFound();
        if (meetup.status === "confirmed") return alreadyConfirmed();

        const result = validateMeetupInput(body, todayInSeoul(deps.now()), meetup.dates);
        if (!result.ok) return invalid(result.errors);

        const changed = await updateMeetup(db, id, result.value, { clearAvailability: result.value.dayStart !== meetup.dayStart });
        // 위에서 확인한 뒤 그 사이에 다른 사람이 먼저 확정했거나 모임이 지워진 경우.
        return changed ? json({ ok: true }) : unavailable();
      });
    },

    /** 모임 지우기(편집 권한). 확정으로 만든 달력 일정도 함께 지워진다. */
    remove(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db }) => {
        if (!MEETUP_ID.test(rawId)) return notFound();
        return (await deleteMeetup(db, Number(rawId))) ? json({ ok: true }) : notFound();
      });
    },

    /** 시간 확정(편집 권한). 일정이 만들어지고, "모임 확정" 알림을 응답 뒤에 보낸다. */
    confirm(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db, body, people }) => {
        if (!MEETUP_ID.test(rawId)) return notFound();
        const id = Number(rawId);
        const meetup = await getMeetup(db, id);
        if (!meetup) return notFound();
        if (meetup.status === "confirmed") return alreadyConfirmed();

        const result = validateConfirmInput(body, meetup);
        if (!result.ok) return invalid(result.errors);

        const eventId = await confirmMeetup(db, id, result.value, people);
        // 위에서 확인한 뒤 그 사이에 다른 사람이 먼저 확정했거나 모임이 지워진 경우.
        if (eventId === null) return unavailable();

        deps.runAfter(() =>
          notifyIfConfigured(deps.loadPushDeps, "meetup-confirmed", id, meetupConfirmedPayload({ id, title: meetup.title }, result.value)),
        );
        return json({ eventId, day: result.value.day });
      });
    },

    /** 가능한 시간 저장(**편집 권한 없음**, 이름만 고른다). 그 사람의 칸이 통째로 바뀐다. */
    availability(request: Request, rawId: string): Promise<Response> {
      return guardedWrite(
        deps,
        request,
        async ({ db, body, people }) => {
          if (!MEETUP_ID.test(rawId)) return notFound();
          const id = Number(rawId);
          const meetup = await getMeetup(db, id);
          if (!meetup) return notFound();
          if (meetup.status === "confirmed") return alreadyConfirmed();

          const result = validateAvailabilityInput(body, meetup, people);
          if (!result.ok) return invalid(result.errors);

          const saved = await saveAvailability(db, id, result.value.personId, result.value.cells);
          if (!saved) return unavailable();
          return json({ ok: true, count: result.value.cells.length });
        },
        { requireSession: false, failureLog: "가능한 시간을 저장하다 데이터베이스 오류가 났어요" },
      );
    },
  };
}
