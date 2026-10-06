"use client";

import type { ReactNode } from "react";
import { END_OF_DAY } from "@/lib/events/dates";
import { MAX_TITLE_LENGTH } from "@/lib/events/validate";

export type MeetupFormValue = { title: string; startDate: string; endDate: string; dayStart: string; dayEnd: string };

type Props = {
  value: MeetupFormValue;
  onChange: (update: Partial<MeetupFormValue>) => void;
  fieldErrors: Record<string, string>;
  /** 폼 아래에 붙는 안내 */
  children?: ReactNode;
};

/** 모임의 제목, 후보 날짜, 하루 시간 범위 입력칸. 새 모임 만들기와 모임 수정이 함께 쓴다. */
export function MeetupFields({ value, onChange, fieldErrors, children }: Props) {
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
          <input type="date" value={value.startDate} onChange={(e) => onChange({ startDate: e.target.value })} required />
        </label>
        <label>
          후보 날짜 끝
          <input type="date" value={value.endDate} min={value.startDate} onChange={(e) => onChange({ endDate: e.target.value })} required />
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
          {/* 저장된 자정(24:00)은 시각 입력칸이 못 보여 주므로 00:00으로 보여 준다. 끝에 입력한 00:00은 서버가 자정으로 본다. */}
          <input
            type="time"
            step={1800}
            value={value.dayEnd === END_OF_DAY ? "00:00" : value.dayEnd}
            onChange={(e) => onChange({ dayEnd: e.target.value })}
            required
          />
        </label>
      </div>
      <p className="meta">하루 끝을 00:00으로 정하면 그날 자정(24:00)까지예요.</p>
      {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}
      {children}
    </>
  );
}
