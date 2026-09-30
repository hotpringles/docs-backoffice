"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from "react";
import { shortDayLabel } from "@/lib/calendar/view";
import { saveAvailability } from "@/lib/meetups/client";
import { cellKey } from "@/lib/meetups/slots";
import { createTouchPainter } from "@/lib/meetups/touchPaint";
import { paintKeys, sameKeys, slotLabels, sortedKeys, toggleColumn } from "@/lib/meetups/view";
import type { Person } from "@/lib/people";

type Props = {
  meetupId: number;
  dates: string[];
  dayStart: string;
  slotCount: number;
  slotMinutes: number;
  people: Person[];
  /** 사람 번호 → 가능한 칸 키 목록(서버에 저장된 값) */
  availability: Record<string, string[]>;
  /** 확정된 모임은 읽기 전용이다. */
  readOnly: boolean;
};

const STORAGE_KEY = "meetups:person";
const browserFetch: typeof fetch = (input, init) => fetch(input, init);

function readRememberedPerson(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberPerson(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장이 막혀 있어도(시크릿 창 등) 사용에는 문제없다. 다음에 이름을 다시 고르면 된다.
  }
}

// 브라우저 저장소를 "구독할 것이 없는 외부 값"으로 읽는다. 서버에서는 null, 브라우저에서는 저장된 이름이라서
// 효과(effect) 안에서 상태를 바꾸지 않고도 처음부터 기억한 이름이 골라져 있고, 서버와 브라우저 화면이 어긋나지도 않는다.
const subscribeNothing = () => () => {};
const noRememberedPerson = () => null;

/**
 * 내 시간 표시. 열은 날짜, 행은 30분 칸이다. 마우스는 누른 채 끌어서 칠하고, 터치·키보드는 칸을 눌러 켜고 끈다
 * (터치는 끌면 스크롤이어야 하므로 탭만 쓴다). 저장하면 이 사람의 칸이 통째로 바뀐다.
 */
export function AvailabilityEditor({ meetupId, dates, dayStart, slotCount, slotMinutes, people, availability, readOnly }: Props) {
  const router = useRouter();
  const remembered = useSyncExternalStore(subscribeNothing, readRememberedPerson, noRememberedPerson);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saved, setSaved] = useState(availability);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const drag = useRef<{ on: boolean } | null>(null);
  const lastPointer = useRef("mouse");
  const gridRef = useRef<HTMLDivElement>(null);
  // 터치 이벤트 리스너는 한 번만 달아 두므로, 그 안에서 쓰는 최신 값은 이 상자로 넘긴다(렌더가 끝난 뒤에 채운다).
  const latest = useRef<{ editable: boolean; currentSet: Set<string>; paint: (keys: string[], on: boolean) => void }>({
    editable: false,
    currentSet: new Set(),
    paint: () => {},
  });
  // 꾹 눌러 끌어서 칠한 직후에 따라오는 탭(클릭)이 시작한 칸을 다시 뒤집지 않게 한다.
  const ignoreClickUntil = useRef(0);

  // 이 기기에서 마지막으로 고른 이름이 명단에 아직 있으면 처음부터 골라 둔다. 사용자가 고르면 그 선택이 우선이다.
  const personId = chosen ?? (remembered !== null && people.some((person) => person.id === remembered) ? remembered : null);

  // 마우스 버튼을 표 밖에서 놓아도 칠하기가 끝나야 한다.
  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const editable = !readOnly && personId !== null;
  const current = personId ? (edits[personId] ?? saved[personId] ?? []) : [];
  const currentSet = new Set(current);
  const dirty = personId !== null && !sameKeys(current, saved[personId] ?? []);
  const labels = slotLabels(dayStart, slotCount, slotMinutes);

  function choose(id: string) {
    setChosen(id);
    rememberPerson(id);
    setMessage(null);
  }

  /** 이전 값을 기준으로 바꿔서, 끌면서 빠르게 지나가도 앞에서 칠한 칸이 사라지지 않게 한다. */
  function paint(keys: string[], on: boolean) {
    if (!personId) return;
    setEdits((previous) => ({ ...previous, [personId]: paintKeys(previous[personId] ?? saved[personId] ?? [], keys, on) }));
    setMessage(null);
  }

  useEffect(() => {
    latest.current = { editable, currentSet, paint };
  });

  // 폰: 칸을 꾹(0.3초) 누른 채 끌면 칠하고, 그냥 끌면 스크롤이다. 칠하는 동안만 스크롤을 막아야 해서,
  // 기본이 수동적(passive)인 React의 터치 핸들러 대신 직접 리스너를 단다.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const keyAt = (x: number, y: number): string | null => {
      const element = document.elementFromPoint(x, y);
      return element?.closest<HTMLElement>("[data-key]")?.dataset.key ?? null;
    };
    const painter = createTouchPainter({
      begin: (key) => !latest.current.currentSet.has(key),
      paint: (keys, on) => latest.current.paint(keys, on),
    });
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!latest.current.editable || event.touches.length !== 1 || !touch) {
        painter.cancel();
        return;
      }
      painter.start(touch.clientX, touch.clientY, keyAt(touch.clientX, touch.clientY));
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) {
        painter.cancel();
        return;
      }
      const painting = painter.move(touch.clientX, touch.clientY, keyAt(touch.clientX, touch.clientY));
      if (painting && event.cancelable) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      // 시각은 이벤트가 알려 주는 것(timeStamp)을 쓴다. 클릭 이벤트의 timeStamp와 같은 시계다.
      if (painter.end()) ignoreClickUntil.current = event.timeStamp + 500;
    };
    const onContextMenu = (event: Event) => {
      if (latest.current.editable) event.preventDefault(); // 길게 눌렀을 때 메뉴가 뜨지 않게
    };
    grid.addEventListener("touchstart", onTouchStart, { passive: true });
    grid.addEventListener("touchmove", onTouchMove, { passive: false });
    grid.addEventListener("touchend", onTouchEnd);
    grid.addEventListener("touchcancel", () => painter.cancel());
    grid.addEventListener("contextmenu", onContextMenu);
    return () => {
      painter.cancel();
      grid.removeEventListener("touchstart", onTouchStart);
      grid.removeEventListener("touchmove", onTouchMove);
      grid.removeEventListener("touchend", onTouchEnd);
      grid.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  function toggleDay(day: string) {
    if (!personId) return;
    setEdits((previous) => ({ ...previous, [personId]: toggleColumn(previous[personId] ?? saved[personId] ?? [], day, slotCount) }));
    setMessage(null);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, key: string) {
    lastPointer.current = event.pointerType;
    if (event.pointerType !== "mouse" || !editable) return;
    event.preventDefault(); // 끌 때 글자가 선택되지 않게
    const on = !currentSet.has(key);
    drag.current = { on };
    paint([key], on);
  }

  function onPointerEnter(key: string) {
    if (drag.current) paint([key], drag.current.on);
  }

  function onClick(event: MouseEvent<HTMLButtonElement>, key: string) {
    if (!editable || event.timeStamp < ignoreClickUntil.current) return;
    // 마우스는 위 pointerdown에서 이미 처리했다. 터치와 키보드(detail이 0)는 여기서 켜고 끈다.
    if (event.detail === 0 || lastPointer.current !== "mouse") paint([key], !currentSet.has(key));
  }

  async function save() {
    if (!personId) return;
    setBusy(true);
    setMessage(null);
    const keys = sortedKeys(current);
    const result = await saveAvailability(browserFetch, meetupId, personId, keys);
    setBusy(false);
    if (result.ok) {
      setSaved((previous) => ({ ...previous, [personId]: keys }));
      setMessage({ kind: "ok", text: "저장했어요." });
      router.refresh();
      return;
    }
    setMessage({ kind: "error", text: result.message });
    if (result.status === 409) router.refresh(); // 그 사이에 확정됐다면 화면을 새로 불러온다.
  }

  return (
    <div className="availability">
      <div className="person-chips" role="radiogroup" aria-label="내 이름">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            role="radio"
            aria-checked={personId === person.id}
            className={personId === person.id ? "chip selected" : "chip"}
            onClick={() => choose(person.id)}
          >
            {person.name}
          </button>
        ))}
      </div>

      {readOnly ? (
        <p className="meta">확정된 모임이라 더 이상 바꿀 수 없어요.</p>
      ) : personId === null ? (
        <p className="meta">먼저 위에서 내 이름을 골라 주세요.</p>
      ) : (
        <p className="meta">
          칸을 눌러 가능한 시간을 표시하세요. 마우스는 끌어서, 폰은 칸을 꾹 누른 채 끌어서 칠할 수 있어요(그냥 끌면 스크롤). 날짜를 누르면 그 날 전체를 켜고 꺼요.
        </p>
      )}

      <div className="slot-scroll" ref={gridRef}>
        <table className="slot-grid">
          <thead>
            <tr>
              <th aria-hidden="true" />
              {dates.map((day) => (
                <th key={day} scope="col">
                  <button type="button" className="link-button" disabled={!editable} onClick={() => toggleDay(day)}>
                    {shortDayLabel(day)}
                  </button>
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
                  const on = currentSet.has(key);
                  return (
                    <td key={key}>
                      <button
                        type="button"
                        className={on ? "slot on" : "slot"}
                        aria-pressed={on}
                        aria-label={`${shortDayLabel(day)} ${label}`}
                        data-key={key}
                        disabled={!editable}
                        onPointerDown={(event) => onPointerDown(event, key)}
                        onPointerEnter={() => onPointerEnter(key)}
                        onClick={(event) => onClick(event, key)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="editor-actions">
        <button type="button" onClick={save} disabled={!editable || busy || !dirty}>
          {busy ? "저장 중…" : "저장"}
        </button>
        {dirty && <span className="meta">저장하지 않은 변경이 있어요.</span>}
      </div>
      {message && (
        <p className={message.kind === "ok" ? "meta" : "form-error"} role={message.kind === "ok" ? "status" : "alert"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
