"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MAX_TITLE_LENGTH } from "@/lib/events/validate";
import { createMeetup } from "@/lib/meetups/client";
import { CodeForm } from "./CodeForm";
import { useEditGate } from "./useEditGate";

type Form = { title: string; startDate: string; endDate: string; dayStart: string; dayEnd: string };
/** 코드를 확인한 뒤 이어서 할 일. "resume"은 작성 중이던 폼으로 돌아간다. */
type Action = "open" | "resume";

const browserFetch: typeof fetch = (input, init) => fetch(input, init);

/** 새 모임 만들기. 편집 코드가 필요하고, 만들면 그 모임 화면으로 이동한다. */
export function MeetupCreator({ canEdit, today }: { canEdit: boolean; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>({ title: "", startDate: today, endDate: today, dayStart: "09:00", dayEnd: "22:00" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const gate = useEditGate<Action>(canEdit, (action) => {
    if (action === "open") setOpen(true);
  });

  function patch(update: Partial<Form>) {
    setForm((current) => ({ ...current, ...update }));
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
    <form className="event-form" onSubmit={submit}>
      <label>
        제목
        <input type="text" value={form.title} maxLength={MAX_TITLE_LENGTH} onChange={(e) => patch({ title: e.target.value })} required />
        {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
      </label>

      <label>
        후보 날짜 시작
        <input type="date" value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} required />
      </label>
      <label>
        후보 날짜 끝
        <input type="date" value={form.endDate} onChange={(e) => patch({ endDate: e.target.value })} required />
        {fieldErrors.dates && <span className="field-error">{fieldErrors.dates}</span>}
      </label>

      <div className="time-row">
        <label>
          하루 시작
          <input type="time" step={1800} value={form.dayStart} onChange={(e) => patch({ dayStart: e.target.value })} required />
        </label>
        <label>
          하루 끝
          <input type="time" step={1800} value={form.dayEnd} onChange={(e) => patch({ dayEnd: e.target.value })} required />
        </label>
      </div>
      {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}
      <p className="meta">후보 날짜는 최대 14일이고, 시간은 30분 단위예요.</p>

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
