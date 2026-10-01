"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { deleteEvent, login, saveEvent, type ApiError } from "@/lib/events/client";
import { emptyForm, formFromEvent, formToPayload, patchForm, type EventFormState } from "@/lib/events/form";
import type { EventRecord } from "@/lib/events/store";
import type { FieldErrors } from "@/lib/events/validate";
import type { Person } from "@/lib/people";

/** 코드를 확인한 뒤에 이어서 할 일. "resume"은 작성 중이던 폼으로 돌아간다. */
export type Pending =
  | { kind: "add"; date: string }
  | { kind: "edit"; event: EventRecord }
  | { kind: "delete"; event: EventRecord }
  | { kind: "resume" };
/** `source`는 수정 중인 원래 일정(추가 중이면 null). 폼 안의 삭제 버튼이 쓴다. */
type Draft = { eventId: number | null; form: EventFormState; source: EventRecord | null };
type Prompt = { then: Pending; message: string | null };

const browserFetch: typeof fetch = (input, init) => fetch(input, init);

/**
 * 일정을 추가·수정·삭제하는 흐름의 상태. 편집 코드를 아직 입력하지 않았으면 코드부터 묻고, 맞으면 하려던 일을 이어서 한다.
 * 화면(날짜 옆 창, 대화 상자)은 이 상태를 받아서 그리기만 한다.
 */
export function useEventEditing({ people, canEdit }: { people: Person[]; canEdit: boolean }) {
  const router = useRouter();
  const [authed, setAuthed] = useState(canEdit);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function perform(action: Pending) {
    if (action.kind === "add") setDraft({ eventId: null, form: emptyForm(action.date), source: null });
    else if (action.kind === "edit") setDraft({ eventId: action.event.id, form: formFromEvent(action.event, people), source: action.event });
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
    const note = target.meetupId === null ? "" : " 모임을 확정해서 만든 일정이라, 지우면 그 모임과 가능한 시간 표시도 함께 삭제돼요.";
    if (!window.confirm(`"${target.title}" 일정을 삭제할까요?${note}`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteEvent(browserFetch, target.id);
    setBusy(false);
    if (result.ok) {
      setDraft(null); // 수정 폼 안에서 지웠다면 폼도 닫는다.
      router.refresh();
      return;
    }
    fail(result, { kind: "delete", event: target });
  }

  /** 수정 폼에서 그 일정을 지운다(확인창을 거친다). */
  function removeDraft() {
    if (draft?.source) begin({ kind: "delete", event: draft.source });
  }

  function patch(update: Partial<EventFormState>) {
    setDraft((current) => (current ? { ...current, form: patchForm(current.form, update) } : current));
  }

  function cancel() {
    setDraft(null);
    setPrompt(null);
    setCode("");
    setError(null);
    setFieldErrors({});
  }

  return {
    draft,
    prompt,
    code,
    setCode,
    busy,
    error,
    fieldErrors,
    /** 코드 입력이나 일정 폼이 떠 있는지(대화 상자를 열어야 하는지) */
    dialogOpen: prompt !== null || draft !== null,
    begin,
    removeDraft,
    submitCode,
    submitForm,
    patch,
    cancel,
  };
}

export type EventEditing = ReturnType<typeof useEventEditing>;
