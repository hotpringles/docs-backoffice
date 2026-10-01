"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { shortDayLabel } from "@/lib/calendar/view";
import { toggleValue } from "@/lib/events/form";
import { REMIND_OPTIONS } from "@/lib/events/validate";
import { confirmMeetup, deleteMeetup } from "@/lib/meetups/client";
import type { Recommendation } from "@/lib/meetups/overlap";
import { slotTime } from "@/lib/meetups/slots";
import type { MeetupStatus } from "@/lib/meetups/store";
import { recommendationLabel } from "@/lib/meetups/view";
import { CodeForm } from "./CodeForm";
import { useEditGate } from "./useEditGate";

type Props = {
  meetupId: number;
  title: string;
  status: MeetupStatus;
  dates: string[];
  dayStart: string;
  slotCount: number;
  slotMinutes: number;
  recommendations: Recommendation[];
  canEdit: boolean;
  /** 확정으로 만들어진 일정의 날짜(달력으로 가는 링크에 쓴다) */
  confirmedOn: string | null;
};

/** 코드를 확인한 뒤 이어서 할 일. "resume"은 작성 중이던 확정 폼으로 돌아간다. */
type Action = "confirm" | "delete" | "resume";
type Choice = number | "custom";

const REMIND_LABEL: Record<number, string> = { 0: "당일", 1: "1일 전", 3: "3일 전" };
const browserFetch: typeof fetch = (input, init) => fetch(input, init);

/** 시간 확정과 모임 삭제. 둘 다 편집 코드가 필요하다. */
export function MeetupAdmin({ meetupId, title, status, dates, dayStart, slotCount, slotMinutes, recommendations, canEdit, confirmedOn }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState(false);
  const [choice, setChoice] = useState<Choice>(recommendations.length > 0 ? 0 : "custom");
  const [custom, setCustom] = useState({ day: dates[0], start: 0, end: Math.min(2, slotCount) });
  const [remind, setRemind] = useState<number[]>([0, 1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openPanel() {
    setChoice(recommendations.length > 0 ? 0 : "custom");
    setPanel(true);
  }

  async function remove(expire: (action: Action) => void) {
    if (!window.confirm(`"${title}" 모임을 삭제할까요? 확정으로 만든 달력 일정도 함께 지워져요.`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteMeetup(browserFetch, meetupId);
    setBusy(false);
    if (result.ok) {
      router.push("/meetups");
      return;
    }
    if (result.status === 401) {
      expire("delete");
      return;
    }
    setError(result.message);
  }

  const gate = useEditGate<Action>(canEdit, (action, expire) => {
    if (action === "confirm") openPanel();
    else if (action === "delete") void remove(expire);
  });

  function selectedSpan(): { day: string; startTime: string; endTime: string } {
    const rec = choice === "custom" ? undefined : recommendations[choice];
    if (rec) return { day: rec.day, startTime: rec.startTime, endTime: rec.endTime };
    return { day: custom.day, startTime: slotTime(dayStart, custom.start, slotMinutes), endTime: slotTime(dayStart, custom.end, slotMinutes) };
  }

  async function submitConfirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const span = selectedSpan();
    const result = await confirmMeetup(browserFetch, meetupId, { ...span, remindOffsets: remind });
    setBusy(false);
    if (result.ok) {
      router.push(`/calendar?month=${span.day.slice(0, 7)}&date=${span.day}`);
      return;
    }
    if (result.status === 401) {
      gate.expire("resume"); // 작성 중인 확정 폼은 그대로 두고 코드만 다시 받는다.
      return;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setError(result.message);
    if (result.status === 409) router.refresh(); // 그 사이에 다른 사람이 먼저 확정했다면 화면을 새로 불러온다.
  }

  if (gate.prompt) {
    return (
      <>
        <CodeForm
          message={gate.prompt.message ?? "모임을 바꾸려면 팀 편집 코드가 필요해요."}
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

  return (
    <div className="admin">
      {status === "confirmed" && (
        <p className="banner">
          이 모임은 확정됐어요.{" "}
          {confirmedOn && <Link href={`/calendar?month=${confirmedOn.slice(0, 7)}&date=${confirmedOn}`}>달력에서 보기</Link>}
        </p>
      )}

      {panel && status === "open" ? (
        <form className="event-form confirm-panel" onSubmit={submitConfirm}>
          <fieldset>
            <legend>확정할 시간</legend>
            {recommendations.map((rec, index) => (
              <label key={`${rec.day}-${rec.startSlot}-${rec.endSlot}`} className="check">
                <input type="radio" name="choice" checked={choice === index} onChange={() => setChoice(index)} />
                {recommendationLabel(rec)}
              </label>
            ))}
            <label className="check">
              <input type="radio" name="choice" checked={choice === "custom"} onChange={() => setChoice("custom")} />
              직접 입력
            </label>
          </fieldset>

          {choice === "custom" && (
            <div className="time-row">
              <select aria-label="날짜" value={custom.day} onChange={(e) => setCustom((c) => ({ ...c, day: e.target.value }))}>
                {dates.map((day) => (
                  <option key={day} value={day}>
                    {shortDayLabel(day)}
                  </option>
                ))}
              </select>
              <select aria-label="시작 시각" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: Number(e.target.value) }))}>
                {Array.from({ length: slotCount }, (_, slot) => (
                  <option key={slot} value={slot}>
                    {slotTime(dayStart, slot, slotMinutes)}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">~</span>
              <select aria-label="끝 시각" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: Number(e.target.value) }))}>
                {Array.from({ length: slotCount }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {slotTime(dayStart, index + 1, slotMinutes)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {fieldErrors.day && <span className="field-error">{fieldErrors.day}</span>}
          {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}

          <fieldset>
            <legend>일정 알림</legend>
            {REMIND_OPTIONS.map((offset) => (
              <label key={offset} className="check">
                <input
                  type="checkbox"
                  checked={remind.includes(offset)}
                  onChange={() => setRemind((current) => toggleValue(current, offset).sort((a, b) => a - b))}
                />
                {REMIND_LABEL[offset]}
              </label>
            ))}
            {fieldErrors.remindOffsets && <span className="field-error">{fieldErrors.remindOffsets}</span>}
          </fieldset>

          <p className="meta">확정하면 달력에 일정이 생기고, 그 시간에 모두 가능한 사람이 참석자로 들어가요.</p>
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "확정하는 중…" : "확정"}
            </button>
            <button type="button" onClick={() => setPanel(false)} disabled={busy}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <div className="editor-actions">
          {status === "open" && (
            <button type="button" onClick={() => gate.run("confirm")} disabled={busy}>
              시간 확정
            </button>
          )}
          {/* 열린 모임의 수정·삭제는 모임 제목 옆에 있다. 확정된 모임은 여기서만 지울 수 있다. */}
          {status === "confirmed" && (
            <button type="button" onClick={() => gate.run("delete")} disabled={busy}>
              모임 삭제
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
