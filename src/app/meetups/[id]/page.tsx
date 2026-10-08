import Link from "next/link";
import { notFound } from "next/navigation";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { Heatmap } from "@/components/Heatmap";
import { MeetupAdmin } from "@/components/MeetupAdmin";
import { MeetupHeaderActions } from "@/components/MeetupHeaderActions";
import { MeetupTabs } from "@/components/MeetupTabs";
import { hasEditSession } from "@/lib/auth/server";
import { getDbOrNull } from "@/lib/db";
import { getEvent, type EventRecord } from "@/lib/events/store";
import { computeOverlap } from "@/lib/meetups/overlap";
import { slotCount } from "@/lib/meetups/slots";
import { getMeetup, getMeetupEventId, listAvailability, listAvailabilityModes, type MeetupRecord } from "@/lib/meetups/store";
import { meetupRangeLabel, recommendationLabel } from "@/lib/meetups/view";
import { loadPeople } from "@/lib/people";

export const metadata = { title: "모임" };

const MEETUP_ID = /^[1-9]\d{0,8}$/;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function MeetupPage({ params, searchParams }: Props) {
  const { id: rawId } = await params;
  const { tab } = await searchParams;
  if (!MEETUP_ID.test(rawId)) notFound();
  const id = Number(rawId);

  // 데이터베이스 문제는 모임 화면에서만 안내하고, 문서 뷰어에는 영향을 주지 않는다.
  let meetup: MeetupRecord | null = null;
  let availability: Record<string, string[]> = {};
  let modes: Record<string, "available" | "unavailable"> = {};
  let confirmedEvent: EventRecord | null = null;
  let problem: string | null = null;
  const db = getDbOrNull();
  if (!db) {
    problem = "데이터베이스가 설정되지 않아서 모임을 불러올 수 없어요.";
  } else {
    try {
      meetup = await getMeetup(db, id);
      if (meetup) {
        availability = await listAvailability(db, id);
        modes = await listAvailabilityModes(db, id);
        if (meetup.status === "confirmed") {
          const eventId = await getMeetupEventId(db, id);
          confirmedEvent = eventId === null ? null : await getEvent(db, eventId);
        }
      }
    } catch (error) {
      console.error("모임을 불러오지 못했어요", error);
      problem = "모임을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
    }
  }

  if (!problem && !meetup) notFound();
  if (problem || !meetup) {
    return (
      <main className="page">
        <p>
          <Link href="/meetups" className="crumb-back">‹ 모임 목록</Link>
        </p>
        <p className="banner">{problem}</p>
      </main>
    );
  }

  const people = loadPeople();
  const roster = people.ok ? people.people : [];
  const count = slotCount(meetup.dayStart, meetup.dayEnd, meetup.slotMinutes);
  const overlap = computeOverlap({
    dates: meetup.dates,
    dayStart: meetup.dayStart,
    dayEnd: meetup.dayEnd,
    slotMinutes: meetup.slotMinutes,
    people: roster,
    availability,
  });
  // 불가능한 시간 방식으로 모든 칸을 막은 사람도(가능한 칸이 0개여도) 응답한 것이다.
  const responded = roster.filter((person) => (availability[person.id]?.length ?? 0) > 0 || modes[person.id] !== undefined).length;
  const activeTab = tab === "all" ? "all" : "mine";
  const canEdit = await hasEditSession();

  return (
    <main className="page meetup-page">
      <p>
        <Link href="/meetups" className="crumb-back">‹ 모임 목록</Link>
      </p>
      <div className="meetup-head">
        <h1>{meetup.title}</h1>
        {meetup.status === "open" && <MeetupHeaderActions meetup={meetup} canEdit={canEdit} />}
      </div>
      <p className="meta">
        {meetupRangeLabel(meetup.dates)} · 하루 {meetup.dayStart}–{meetup.dayEnd} · {meetup.status === "confirmed" ? "확정됨" : "열린 모임"} ·{" "}
        {responded}/{roster.length}명이 표시했어요
      </p>
      {!people.ok && <p className="banner">{people.error}</p>}

      {/* 날짜나 하루 범위가 수정되면 표를 새로 시작한다(표 안의 상태가 옛 모양에 남아 있으면 안 된다). */}
      <MeetupTabs
        key={`${meetup.dates.join(",")}|${meetup.dayStart}|${meetup.dayEnd}`}
        initial={activeTab}
        mine={
          <AvailabilityEditor
            meetupId={id}
            dates={meetup.dates}
            dayStart={meetup.dayStart}
            slotCount={count}
            slotMinutes={meetup.slotMinutes}
            people={roster}
            availability={availability}
            modes={modes}
            readOnly={meetup.status === "confirmed"}
          />
        }
        all={
          <>
            <Heatmap
              dates={meetup.dates}
              dayStart={meetup.dayStart}
              slotCount={count}
              slotMinutes={meetup.slotMinutes}
              cells={overlap.cells}
              total={overlap.total}
              people={roster}
            />
            <section className="group">
              <h2>추천 시간</h2>
              {overlap.recommendations.length === 0 ? (
                <p className="empty">아직 함께 되는 시간이 없어요. 1시간(칸 2개) 이상 겹쳐야 추천해요.</p>
              ) : (
                <ol className="reco-list">
                  {overlap.recommendations.map((rec) => (
                    <li key={`${rec.day}-${rec.startSlot}-${rec.endSlot}`}>{recommendationLabel(rec)}</li>
                  ))}
                </ol>
              )}
            </section>
            <MeetupAdmin
              meetupId={id}
              title={meetup.title}
              status={meetup.status}
              dates={meetup.dates}
              dayStart={meetup.dayStart}
              slotCount={count}
              slotMinutes={meetup.slotMinutes}
              recommendations={overlap.recommendations}
              canEdit={canEdit}
              confirmedOn={confirmedEvent?.date ?? null}
            />
          </>
        }
      />
    </main>
  );
}
