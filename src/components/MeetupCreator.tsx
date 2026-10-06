"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createMeetup } from "@/lib/meetups/client";
import { defaultMeetupDates } from "@/lib/meetups/slots";
import { CodeForm } from "./CodeForm";
import { MeetupFields, type MeetupFormValue } from "./MeetupFields";
import { useEditGate } from "./useEditGate";

type Form = MeetupFormValue;
/** 코드를 확인한 뒤 이어서 할 일. "resume"은 작성 중이던 폼으로 돌아간다. */
type Action = "open" | "resume";

const browserFetch: typeof fetch = (input, init) => fetch(input, init);

/** 새 모임 만들기. 편집 코드가 필요하고, 만들면 그 모임 화면으로 이동한다. */
export function MeetupCreator({ canEdit, today }: { canEdit: boolean; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>({ title: "", ...defaultMeetupDates(today), dayStart: "09:00", dayEnd: "22:00" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const gate = useEditGate<Action>(canEdit, (action) => {
    if (action === "open") setOpen(true);
  });

  function patch(update: Partial<Form>) {
    setForm((current) => {
      const next = { ...current, ...update };
      // 시작일을 끝일보다 뒤로 옮기면 끝일도 함께 옮겨서 "끝이 시작보다 빠름" 오류가 나지 않게 한다.
      if (update.startDate !== undefined && update.endDate === undefined && next.startDate > next.endDate) next.endDate = next.startDate;
      return next;
    });
  }

  function cancel() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await createMeetup(browserFetch, form);
    setBusy(false);
    if (result.ok) {
      router.push(`/meetups/${result.data.id}`);
      return;
    }
    if (result.status === 401) {
      // 쿠키가 만료됐거나 없어진 경우: 코드를 다시 받고, 작성 중인 폼은 그대로 둔다.
      gate.expire("resume");
      return;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setError(result.message);
  }

  if (gate.prompt) {
    return (
      <>
        <CodeForm
          message={gate.prompt.message ?? "모임을 만들려면 팀 편집 코드가 필요해요."}
          code={gate.code}
          busy={gate.busy}
          onCodeChange={gate.setCode}
          onSubmit={gate.submit}
          onCancel={gate.cancel}
        />
        {gate.error && (
          <p className="form-error" role="alert">
            {gate.error}
          </p>
        )}
      </>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => gate.run("open")}>
        새 모임 만들기
      </button>
    );
  }

  return (
    <form className="event-form meetup-form" onSubmit={submit}>
      <MeetupFields value={form} onChange={patch} fieldErrors={fieldErrors}>
        <p className="meta">
          후보 날짜는 처음에 오늘부터 일주일로 채워져 있어요. 날짜는 자유롭게 고를 수 있고(최대 14일), 시간은 30분 단위예요.
        </p>
      </MeetupFields>

      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "만드는 중…" : "만들기"}
        </button>
        <button type="button" onClick={cancel} disabled={busy}>
          취소
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
