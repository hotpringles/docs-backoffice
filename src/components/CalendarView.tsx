"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DayCell } from "@/lib/calendar/month";
import { placePopover, type Placement } from "@/lib/calendar/popover";
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

type OpenWindow = { date: string; placement: Placement | null };

/**
 * 달력 화면. 화면 높이에 맞춘 월 달력이고, 날짜를 누르면 그 날짜 옆에 작은 창이 떠서 일정을 보여 준다.
 * 일정 추가·수정은 화면 가운데의 대화 상자에서 한다.
 */
export function CalendarView({ title, prevHref, nextHref, weeks, eventsByDate, today, initialDate, people, canEdit, problem, notices }: Props) {
  const editing = useEventEditing({ people, canEdit });
  const [open, setOpen] = useState<OpenWindow | null>(initialDate ? { date: initialDate, placement: null } : null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openDate = open?.date ?? null;

  function select(date: string, element: HTMLElement) {
    if (open?.date === date) {
      setOpen(null);
      return;
    }
    triggerRef.current = element;
    const placement = placePopover(element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    setOpen({ date, placement });
  }

  // 열려 있는 창은 바깥을 누르거나 Esc를 누르거나 화면 크기가 바뀌면 닫는다(자리가 어긋나기 때문이다).
  useEffect(() => {
    if (!openDate) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (popoverRef.current?.contains(target)) return;
      if (target.closest(".cal-cell")) return; // 다른 날짜를 누른 것이면 그 칸의 클릭이 창을 옮긴다.
      if (target.closest(".cal-add")) return; // 일정 추가는 열려 있는 날짜를 기본 날짜로 삼으니, 그 버튼이 직접 창을 닫는다.
      setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(null);
      triggerRef.current?.focus();
    };
    const onResize = () => setOpen(null);
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
    if (openDate) popoverRef.current?.focus();
  }, [openDate]);

  function addEvent() {
    setOpen(null);
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

      {open && !problem && (
        <DayPopover
          ref={popoverRef}
          date={open.date}
          events={eventsByDate[open.date] ?? []}
          people={people}
          placement={open.placement}
          authed={editing.authed}
          busy={editing.busy}
          error={editing.dialogOpen ? null : editing.error}
          onClose={() => {
            setOpen(null);
            triggerRef.current?.focus();
          }}
          onEdit={(event) => {
            setOpen(null);
            editing.begin({ kind: "edit", event });
          }}
          onDelete={(event) => editing.begin({ kind: "delete", event })}
          onEndEditing={editing.endEditing}
        />
      )}

      <EventDialog editing={editing} people={people} />
    </main>
  );
}
