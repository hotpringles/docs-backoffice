"use client";

import { toggleValue } from "@/lib/events/form";
import { MAX_MEMO_LENGTH, MAX_TITLE_LENGTH, REMIND_OPTIONS } from "@/lib/events/validate";
import type { Person } from "@/lib/people";
import { CodeForm } from "./CodeForm";
import { Modal } from "./Modal";
import type { EventEditing } from "./useEventEditing";

const REMIND_LABEL: Record<number, string> = { 0: "당일", 1: "1일 전", 3: "3일 전" };

/** 일정 추가·수정 폼과 편집 코드 입력을 담는 대화 상자. 열고 닫는 것은 `editing` 상태가 정한다. */
export function EventDialog({ editing, people }: { editing: EventEditing; people: Person[] }) {
  const { draft, prompt, fieldErrors } = editing;
  const label = prompt ? "편집 코드 입력" : draft?.eventId === null ? "일정 추가" : "일정 수정";

  return (
    <Modal open={editing.dialogOpen} onClose={editing.cancel} label={label}>
      {prompt ? (
        <CodeForm
          message={prompt.message ?? "일정을 바꾸려면 팀 편집 코드가 필요해요."}
          code={editing.code}
          busy={editing.busy}
          onCodeChange={editing.setCode}
          onSubmit={editing.submitCode}
          onCancel={editing.cancel}
        />
      ) : draft ? (
        <form className="event-form" onSubmit={editing.submitForm}>
          <h2 className="modal-title">{label}</h2>
          <label>
            제목
            <input
              type="text"
              value={draft.form.title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => editing.patch({ title: e.target.value })}
              required
              autoFocus
            />
            {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
          </label>

          <label>
            날짜
            <input type="date" value={draft.form.date} onChange={(e) => editing.patch({ date: e.target.value })} required />
            {fieldErrors.date && <span className="field-error">{fieldErrors.date}</span>}
          </label>

          <label className="check">
            <input type="checkbox" checked={draft.form.allDay} onChange={(e) => editing.patch({ allDay: e.target.checked })} />
            종일
          </label>
          {!draft.form.allDay && (
            <div className="time-row">
              <input
                type="time"
                aria-label="시작 시각"
                value={draft.form.startTime}
                onChange={(e) => editing.patch({ startTime: e.target.value })}
                required
              />
              <span aria-hidden="true">~</span>
              <input
                type="time"
                aria-label="종료 시각"
                value={draft.form.endTime}
                onChange={(e) => editing.patch({ endTime: e.target.value })}
                required
              />
            </div>
          )}
          {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}

          <label>
            메모
            <textarea rows={3} value={draft.form.memo} maxLength={MAX_MEMO_LENGTH} onChange={(e) => editing.patch({ memo: e.target.value })} />
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
                    onChange={() => editing.patch({ attendeeIds: toggleValue(draft.form.attendeeIds, person.id) })}
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
                  onChange={() => editing.patch({ remindOffsets: toggleValue(draft.form.remindOffsets, offset).sort((a, b) => a - b) })}
                />
                {REMIND_LABEL[offset]}
              </label>
            ))}
            {fieldErrors.remindOffsets && <span className="field-error">{fieldErrors.remindOffsets}</span>}
          </fieldset>

          <div className="form-actions">
            <button type="submit" disabled={editing.busy}>
              {editing.busy ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={editing.cancel} disabled={editing.busy}>
              취소
            </button>
            {draft.eventId !== null && (
              <button type="button" className="danger" onClick={editing.removeDraft} disabled={editing.busy}>
                삭제
              </button>
            )}
          </div>
        </form>
      ) : null}
      {editing.error && (
        <p className="form-error" role="alert">
          {editing.error}
        </p>
      )}
    </Modal>
  );
}
