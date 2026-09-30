"use client";

import { useState } from "react";
import { shortDayLabel } from "@/lib/calendar/view";
import type { CellSummary } from "@/lib/meetups/overlap";
import { cellKey } from "@/lib/meetups/slots";
import { heatLevel, slotLabels } from "@/lib/meetups/view";
import { nameOf, type Person } from "@/lib/people";

type Props = {
  dates: string[];
  dayStart: string;
  slotCount: number;
  slotMinutes: number;
  cells: Record<string, CellSummary>;
  total: number;
  people: Person[];
};

/** 전체 결과 표. 가능한 사람이 많을수록 진하고, 칸을 누르면 가능한 사람과 어려운 사람의 이름이 보인다. */
export function Heatmap({ dates, dayStart, slotCount, slotMinutes, cells, total, people }: Props) {
  const [picked, setPicked] = useState<{ day: string; slot: number } | null>(null);
  const labels = slotLabels(dayStart, slotCount, slotMinutes);
  const summary = picked ? cells[cellKey(picked.day, picked.slot)] : undefined;

  return (
    <div className="heatmap">
      <div className="slot-scroll">
        <table className="slot-grid">
          <thead>
            <tr>
              <th aria-hidden="true" />
              {dates.map((day) => (
                <th key={day} scope="col">
                  {shortDayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, slot) => (
              <tr key={label}>
                <th scope="row" className="slot-time">
                  {label}
                </th>
                {dates.map((day) => {
                  const key = cellKey(day, slot);
                  const count = cells[key]?.count ?? 0;
                  const isPicked = picked?.day === day && picked.slot === slot;
                  return (
                    <td key={key}>
                      <button
                        type="button"
                        className={`slot heat-${heatLevel(count, total)}${isPicked ? " picked" : ""}`}
                        aria-label={`${shortDayLabel(day)} ${label}, ${count}명 가능`}
                        onClick={() => setPicked({ day, slot })}
                      >
                        {count > 0 ? count : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="heat-detail" aria-live="polite">
        {picked && summary ? (
          <>
            <p>
              <strong>
                {shortDayLabel(picked.day)} {labels[picked.slot]}
              </strong>{" "}
              · {summary.count}명 가능
            </p>
            <p className="meta">가능: {summary.personIds.length > 0 ? summary.personIds.map((id) => nameOf(people, id)).join(", ") : "아무도 없어요"}</p>
            <p className="meta">
              어려움: {people.filter((person) => !summary.personIds.includes(person.id)).map((person) => person.name).join(", ") || "없어요"}
            </p>
          </>
        ) : (
          <p className="meta">칸을 누르면 그 시간에 가능한 사람 이름이 보여요.</p>
        )}
      </div>
    </div>
  );
}
