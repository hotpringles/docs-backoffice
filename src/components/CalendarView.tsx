"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DayCell } from "@/lib/calendar/month";
import { placePopover } from "@/lib/calendar/popover";
import type { EventRecord } from "@/lib/events/store";
import type { Person } from "@/lib/people";
import { CalendarGrid } from "./CalendarGrid";
import { DayPopover } from "./DayPopover";
import { EventDialog } from "./EventDialog";
import { useEventEditing } from "./useEventEditing";

type Props = {
  /** "2026년 10월" */
  title: string;
  prevHref: string;
  nextHref: string;
  weeks: DayCell[][];
  eventsByDate: Record<string, EventRecord[]>;
  today: string;
  /** 처음부터 일정 창을 열어 둘 날짜(알림을 누르거나 모임을 확정하고 넘어왔을 때) */
  initialDate: string | null;
  people: Person[];
  canEdit: boolean;
  /** 일정을 다룰 수 없는 상태(데이터베이스 문제 등). 있으면 추가 버튼을 막는다. */
  problem: string | null;
  notices: string[];
};

/**
 * 달력 화면. 화면 높이에 맞춘 월 달력이고, 날짜를 누르면 그 날짜 옆에 작은 창이 떠서 일정을 보여 준다.
 * 일정 추가·수정은 화면 가운데의 대화 상자에서 한다.
 */
export function CalendarView({ title, prevHref, nextHref, weeks, eventsByDate, today, initialDate, people, canEdit, problem, notices }: Props) {
  const editing = useEventEditing({ people, canEdit });
  const [openDate, setOpenDate] = useState<string | null>(initialDate);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openEvents = openDate ? (eventsByDate[openDate] ?? []) : [];

  function select(date: string, element: HTMLElement) {
    if (openDate === date) {
      setOpenDate(null);
      return;
    }
    triggerRef.current = element;
    setOpenDate(date);
  }

  // 창을 그린 직후(화면에 보이기 전에) 날짜 칸 옆으로 자리를 잡는다. 달력 표 전체의 경계와 창의 실제 크기를 보고 정하므로,
  // 일정이 늘거나 줄어 창 높이가 바뀔 때마다 다시 잡는다. 화면에 직접 쓰는 값이라 상태는 바꾸지 않는다.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const cell = openDate ? document.querySelector<HTMLElement>(`[data-date="${openDate}"]`) : null;
    const grid = document.querySelector<HTMLElement>(".cal");
    popover.style.removeProperty("max-height"); // 자연스러운 높이를 재려고 이전 제한을 푼다.
    if (cell && grid) {
      const size = popover.getBoundingClientRect();
      const placement = placePopover({
        anchor: cell.getBoundingClientRect(),
        bounds: grid.getBoundingClientRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        size: { width: size.width, height: size.height },
      });
      if (placement) {
        popover.style.left = `${placement.left}px`;
        popover.style.top = `${placement.top}px`;
        popover.style.maxHeight = `${placement.maxHeight}px`;
        popover.style.transform = "none";
      } else {
        // 폰: CSS가 화면 아래 시트로 그린다.
        for (const property of ["left", "top", "transform"]) popover.style.removeProperty(property);
      }
    }
    popover.style.visibility = "visible";
  });

  // 열려 있는 창은 바깥을 누르거나 Esc를 누르거나 화면 크기가 바뀌면 닫는다(자리가 어긋나기 때문이다).
  useEffect(() => {
    if (!openDate) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (popoverRef.current?.contains(target)) return;
      if (target.closest(".cal-cell")) return; // 다른 날짜를 누른 것이면 그 칸의 클릭이 창을 옮긴다.
      if (target.closest(".cal-add")) return; // 일정 추가는 열려 있는 날짜를 기본 날짜로 삼으니, 그 버튼이 직접 창을 닫는다.
      setOpenDate(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenDate(null);
      triggerRef.current?.focus();
    };
    const onResize = () => setOpenDate(null);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [openDate]);

  // 창이 열리면 키보드 사용자가 바로 이어서 쓸 수 있게 포커스를 창으로 옮긴다.
  useEffect(() => {
    if (openDate) popoverRef.current?.focus({ preventScroll: true });
  }, [openDate]);

  function addEvent() {
    setOpenDate(null);
    editing.begin({ kind: "add", date: openDate ?? today });
  }

  return (
    <main className="page cal-page">
      <div className="cal-nav">
        <Link href={prevHref} aria-label="이전 달">
          ‹
        </Link>
        <h1>
          <Link href="/calendar" title="이번 달로 돌아가기">
            {title}
          </Link>
        </h1>
        <Link href={nextHref} aria-label="다음 달">
          ›
        </Link>
        <button type="button" className="cal-add" onClick={addEvent} disabled={problem !== null || editing.busy}>
          일정 추가
        </button>
      </div>

      {problem && <p className="banner">{problem}</p>}
      {notices.map((notice) => (
        <p key={notice} className="banner">
          {notice}
        </p>
      ))}

      <CalendarGrid label={`${title} 달력`} weeks={weeks} eventsByDate={eventsByDate} today={today} openDate={openDate} onSelect={select} />

      {openDate && !problem && (
        <DayPopover
          ref={popoverRef}
          date={openDate}
          events={openEvents}
          people={people}
          authed={editing.authed}
          busy={editing.busy}
          error={editing.dialogOpen ? null : editing.error}
          onClose={() => {
            setOpenDate(null);
            triggerRef.current?.focus();
          }}
          onOpenEvent={(event) => {
            setOpenDate(null);
            editing.begin({ kind: "edit", event });
          }}
          onEndEditing={editing.endEditing}
        />
      )}

      <EventDialog editing={editing} people={people} />
    </main>
  );
}
