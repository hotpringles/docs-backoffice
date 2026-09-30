"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatTimeRange, remindLabel } from "@/lib/calendar/view";
import { deleteEvent, login, logout, saveEvent, type ApiError } from "@/lib/events/client";
import { emptyForm, formFromEvent, formToPayload, toggleValue, type EventFormState } from "@/lib/events/form";
import type { EventRecord } from "@/lib/events/store";
import { MAX_MEMO_LENGTH, MAX_TITLE_LENGTH, REMIND_OPTIONS, type FieldErrors } from "@/lib/events/validate";
import { nameOf, type Person } from "@/lib/people";

type Props = {
  /** 선택한 날짜(YYYY-MM-DD). 날짜가 바뀌면 부모가 key를 바꿔서 이 컴포넌트를 새로 시작한다. */
  date: string;
  events: EventRecord[];
  people: Person[];
  canEdit: boolean;
};

/** 코드를 확인한 뒤에 이어서 할 일. "resume"은 작성 중이던 폼으로 돌아간다. */
type Pending = { kind: "add" } | { kind: "edit"; event: EventRecord } | { kind: "delete"; event: EventRecord } | { kind: "resume" };
type Draft = { eventId: number | null; form: EventFormState };
type Prompt = { then: Pending; message: string | null };

const REMIND_LABEL: Record<number, string> = { 0: "당일", 1: "1일 전", 3: "3일 전" };
const browserFetch: typeof fetch = (input, init) => fetch(input, init);

export function EventEditor({ date, events, people, canEdit }: Props) {
  const router = useRouter();
  const [authed, setAuthed] = useState(canEdit);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function perform(action: Pending) {
    if (action.kind === "add") setDraft({ eventId: null, form: emptyForm(date) });
    else if (action.kind === "edit") setDraft({ eventId: action.event.id, form: formFromEvent(action.event, people) });
    else if (action.kind === "delete") void remove(action.event);
  }

  /** 편집 코드를 아직 입력하지 않았으면 코드부터 묻고, 맞으면 하려던 일을 이어서 한다. */
  function begin(action: Pending) {
    setError(null);
    setFieldErrors({});
    if (!authed) {
      setPrompt({ then: action, message: null });
      return;
    }
    perform(action);
  }

  function fail(result: ApiError, retry: Pending) {
    if (result.status === 401) {
      // 쿠키가 만료됐거나 없어진 경우: 코드를 다시 받고, 하려던 일(폼 내용 포함)은 그대로 둔다.
      setAuthed(false);
      setPrompt({ then: retry, message: "편집 코드를 다시 입력해 주세요." });
      return;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setError(result.message);
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!prompt) return;
    setBusy(true);
    setError(null);
    const result = await login(browserFetch, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAuthed(true);
    setCode("");
    const next = prompt.then;
    setPrompt(null);
    perform(next);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await saveEvent(browserFetch, draft.eventId, formToPayload(draft.form));
    setBusy(false);
    if (result.ok) {
      setDraft(null);
      router.refresh();
      return;
    }
    fail(result, { kind: "resume" });
  }

  async function remove(target: EventRecord) {
    if (!window.confirm(`"${target.title}" 일정을 삭제할까요?`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteEvent(browserFetch, target.id);
    setBusy(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    fail(result, { kind: "delete", event: target });
  }

  async function endEditing() {
    await logout(browserFetch);
    setAuthed(false);
    router.refresh();
  }

  function patch(update: Partial<EventFormState>) {
    setDraft((current) => (current ? { ...current, form: { ...current.form, ...update } } : current));
  }

  function cancel() {
    setDraft(null);
    setPrompt(null);
    setCode("");
    setError(null);
    setFieldErrors({});
  }

  return (
    <div className="editor">
      {prompt ? (
        <form className="code-form" onSubmit={submitCode}>
          <p className="meta">{prompt.message ?? "일정을 바꾸려면 팀 편집 코드가 필요해요."}</p>
          <label>
            편집 코드
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "확인 중…" : "확인"}
            </button>
            <button type="button" onClick={cancel} disabled={busy}>
              취소
            </button>
          </div>
        </form>
      ) : draft ? (
        <form className="event-form" onSubmit={submitForm}>
          <label>
            제목
            <input
              type="text"
              value={draft.form.title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => patch({ title: e.target.value })}
              required
            />
            {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
          </label>

          <label>
            날짜
            <input type="date" value={draft.form.date} onChange={(e) => patch({ date: e.target.value })} required />
            {fieldErrors.date && <span className="field-error">{fieldErrors.date}</span>}
          </label>

          <label className="check">
            <input type="checkbox" checked={draft.form.allDay} onChange={(e) => patch({ allDay: e.target.checked })} />
            종일
          </label>
          {!draft.form.allDay && (
            <div className="time-row">
              <input type="time" aria-label="시작 시각" value={draft.form.startTime} onChange={(e) => patch({ startTime: e.target.value })} required />
              <span aria-hidden="true">~</span>
              <input type="time" aria-label="종료 시각" value={draft.form.endTime} onChange={(e) => patch({ endTime: e.target.value })} required />
            </div>
          )}
          {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}

          <label>
            메모
            <textarea
              rows={3}
              value={draft.form.memo}
              maxLength={MAX_MEMO_LENGTH}
              onChange={(e) => patch({ memo: e.target.value })}
            />
            {fieldErrors.memo && <span className="field-error">{fieldErrors.memo}</span>}
          </label>

          {people.length > 0 && (
            <fieldset>
              <legend>참석자</legend>
              {people.map((person) => (
                <label key={person.id} className="check">
                  <input
                    type="checkbox"
                    checked={draft.form.attendeeIds.includes(person.id)}
                    onChange={() => patch({ attendeeIds: toggleValue(draft.form.attendeeIds, person.id) })}
                  />
                  {person.name}
                </label>
              ))}
              {fieldErrors.attendeeIds && <span className="field-error">{fieldErrors.attendeeIds}</span>}
            </fieldset>
          )}

          <fieldset>
            <legend>알림</legend>
            {REMIND_OPTIONS.map((offset) => (
              <label key={offset} className="check">
                <input
                  type="checkbox"
                  checked={draft.form.remindOffsets.includes(offset)}
                  onChange={() => patch({ remindOffsets: toggleValue(draft.form.remindOffsets, offset).sort((a, b) => a - b) })}
                />
                {REMIND_LABEL[offset]}
              </label>
            ))}
            {fieldErrors.remindOffsets && <span className="field-error">{fieldErrors.remindOffsets}</span>}
          </fieldset>

          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={cancel} disabled={busy}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          {events.length === 0 ? (
            <p className="empty">이날은 일정이 없어요.</p>
          ) : (
            <ul className="event-list">
              {events.map((event) => (
                <li key={event.id} className="event-item">
                  <div className="event-title">{event.title}</div>
                  <p className="event-meta">{formatTimeRange(event)}</p>
                  {event.memo && <p className="event-memo">{event.memo}</p>}
                  {event.attendeeIds.length > 0 && (
                    <p className="event-meta">참석: {event.attendeeIds.map((id) => nameOf(people, id)).join(", ")}</p>
                  )}
                  <p className="event-meta">알림: {remindLabel(event.remindOffsets)}</p>
                  <div className="event-buttons">
                    <button type="button" onClick={() => begin({ kind: "edit", event })} disabled={busy}>
                      수정
                    </button>
                    <button type="button" onClick={() => begin({ kind: "delete", event })} disabled={busy}>
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="editor-actions">
            <button type="button" onClick={() => begin({ kind: "add" })} disabled={busy}>
              일정 추가
            </button>
            {authed && (
              <button type="button" className="link-button" onClick={endEditing}>
                편집 끝내기
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
