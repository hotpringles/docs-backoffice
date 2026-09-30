"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { shortDayLabel } from "@/lib/calendar/view";
import { deleteMeetup, updateMeetup } from "@/lib/meetups/client";
import { meetupDateWindow } from "@/lib/meetups/slots";
import { CodeForm } from "./CodeForm";
import { MeetupFields, type MeetupFormValue } from "./MeetupFields";
import { Modal } from "./Modal";
import { useEditGate } from "./useEditGate";

type Props = {
  meetup: { id: number; title: string; dates: string[]; dayStart: string; dayEnd: string };
  canEdit: boolean;
  /** 서울 기준 오늘("YYYY-MM-DD") */
  today: string;
};

/** 코드를 확인한 뒤 이어서 할 일. "resume"은 작성 중이던 수정 폼으로 돌아간다. */
type Action = "edit" | "delete" | "resume";

const browserFetch: typeof fetch = (input, init) => fetch(input, init);

/** 열린 모임의 제목 옆 "수정"·"삭제". 둘 다 편집 코드가 필요하다. */
export function MeetupHeaderActions({ meetup, canEdit, today }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<MeetupFormValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openEditor() {
    setError(null);
    setFieldErrors({});
    setForm({
      title: meetup.title,
      startDate: meetup.dates[0],
      endDate: meetup.dates[meetup.dates.length - 1],
      dayStart: meetup.dayStart,
      dayEnd: meetup.dayEnd,
    });
  }

  async function remove(expire: (action: Action) => void) {
    if (!window.confirm(`"${meetup.title}" 모임을 삭제할까요? 표시된 가능한 시간도 함께 지워져요.`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteMeetup(browserFetch, meetup.id);
    if (result.ok) {
      router.push("/meetups");
      return;
    }
    setBusy(false);
    if (result.status === 401) {
      expire("delete");
      return;
    }
    setError(result.message);
  }

  const gate = useEditGate<Action>(canEdit, (action, expire) => {
    if (action === "edit") openEditor();
    else if (action === "delete") void remove(expire);
  });

  function patch(update: Partial<MeetupFormValue>) {
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, ...update };
      // 시작일을 끝일보다 뒤로 옮기면 끝일도 함께 옮겨서 "끝이 시작보다 빠름" 오류가 나지 않게 한다.
      if (update.startDate !== undefined && update.endDate === undefined && next.startDate > next.endDate) next.endDate = next.startDate;
      return next;
    });
  }

  function closeEditor() {
    setForm(null);
    setError(null);
    setFieldErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await updateMeetup(browserFetch, meetup.id, form);
    setBusy(false);
    if (result.ok) {
      closeEditor();
      router.refresh();
      return;
    }
    if (result.status === 401) {
      gate.expire("resume"); // 작성 중인 수정 폼은 그대로 두고 코드만 다시 받는다.
      return;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setError(result.message);
    if (result.status === 409) router.refresh(); // 그 사이에 확정됐다면 화면을 새로 불러온다.
  }

  // 날짜 선택칸: 오늘~7일 뒤에, 이미 들어 있던 (지난) 날짜까지 넓혀서 그대로 둘 수 있게 한다.
  const window7 = meetupDateWindow(today);
  const minDate = meetup.dates[0] < window7.min ? meetup.dates[0] : window7.min;
  const last = meetup.dates[meetup.dates.length - 1];
  const maxDate = last > window7.max ? last : window7.max;

  const dialogOpen = gate.prompt !== null || form !== null;
  const startChanged = form !== null && form.dayStart !== meetup.dayStart;

  return (
    <>
      <div className="meetup-actions">
        <button type="button" onClick={() => gate.run("edit")} disabled={busy}>
          수정
        </button>
        <button type="button" className="danger" onClick={() => gate.run("delete")} disabled={busy}>
          삭제
        </button>
      </div>
      {error && !dialogOpen && (
        <p className="form-error meetup-actions-error" role="alert">
          {error}
        </p>
      )}

      <Modal open={dialogOpen} onClose={() => { gate.cancel(); closeEditor(); }} label={gate.prompt ? "편집 코드 입력" : "모임 수정"}>
        {gate.prompt ? (
          <>
            <CodeForm
              message={gate.prompt.message ?? "모임을 바꾸려면 팀 편집 코드가 필요해요."}
              code={gate.code}
              busy={gate.busy}
              onCodeChange={gate.setCode}
              onSubmit={gate.submit}
              onCancel={() => {
                gate.cancel();
                closeEditor();
              }}
            />
            {gate.error && (
              <p className="form-error" role="alert">
                {gate.error}
              </p>
            )}
          </>
        ) : form ? (
          <form className="event-form" onSubmit={submit}>
            <h2 className="modal-title">모임 수정</h2>
            <MeetupFields value={form} onChange={patch} minDate={minDate} maxDate={maxDate} fieldErrors={fieldErrors}>
              <p className="meta">
                후보 날짜는 오늘부터 일주일 뒤({shortDayLabel(window7.max)})까지 새로 더할 수 있고, 시간은 30분 단위예요. 날짜나 하루 끝을 줄이면
                그 밖에 이미 표시된 시간은 지워져요.
              </p>
              {startChanged && (
                <p className="form-error" role="status">
                  하루 시작 시각을 바꾸면 이미 표시된 가능한 시간이 모두 지워져요.
                </p>
              )}
            </MeetupFields>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
              <button type="button" onClick={closeEditor} disabled={busy}>
                취소
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : null}
      </Modal>
    </>
  );
}
