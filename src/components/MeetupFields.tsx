"use client";

import type { ReactNode } from "react";
import { MAX_TITLE_LENGTH } from "@/lib/events/validate";

export type MeetupFormValue = { title: string; startDate: string; endDate: string; dayStart: string; dayEnd: string };

type Props = {
  value: MeetupFormValue;
  onChange: (update: Partial<MeetupFormValue>) => void;
  /** 날짜 선택칸의 처음과 끝(범위 밖 날짜는 달력에서 고를 수 없다) */
  minDate: string;
  maxDate: string;
  fieldErrors: Record<string, string>;
  /** 폼 아래에 붙는 안내 */
  children?: ReactNode;
};

/** 모임의 제목, 후보 날짜, 하루 시간 범위 입력칸. 새 모임 만들기와 모임 수정이 함께 쓴다. */
export function MeetupFields({ value, onChange, minDate, maxDate, fieldErrors, children }: Props) {
  return (
    <>
      <label>
        제목
        <input type="text" value={value.title} maxLength={MAX_TITLE_LENGTH} onChange={(e) => onChange({ title: e.target.value })} required />
        {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
      </label>

      <div className="field-row">
        <label>
          후보 날짜 시작
          <input type="date" value={value.startDate} min={minDate} max={maxDate} onChange={(e) => onChange({ startDate: e.target.value })} required />
        </label>
        <label>
          후보 날짜 끝
          <input type="date" value={value.endDate} min={value.startDate || minDate} max={maxDate} onChange={(e) => onChange({ endDate: e.target.value })} required />
        </label>
      </div>
      {fieldErrors.dates && <span className="field-error">{fieldErrors.dates}</span>}

      <div className="field-row">
        <label>
          하루 시작
          <input type="time" step={1800} value={value.dayStart} onChange={(e) => onChange({ dayStart: e.target.value })} required />
        </label>
        <label>
          하루 끝
          <input type="time" step={1800} value={value.dayEnd} onChange={(e) => onChange({ dayEnd: e.target.value })} required />
        </label>
      </div>
      {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}
      {children}
    </>
  );
}
