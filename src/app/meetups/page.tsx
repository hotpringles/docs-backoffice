import Link from "next/link";
import { MeetupCreator } from "@/components/MeetupCreator";
import { hasEditSession } from "@/lib/auth/server";
import { getDbOrNull } from "@/lib/db";
import { todayInSeoul } from "@/lib/events/dates";
import { listMeetups, type MeetupRecord } from "@/lib/meetups/store";
import { meetupRangeLabel } from "@/lib/meetups/view";

export const metadata = { title: "모임" };

function MeetupList({ meetups, empty }: { meetups: MeetupRecord[]; empty: string }) {
  if (meetups.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="meetup-list">
      {meetups.map((meetup) => (
        <li key={meetup.id}>
          <Link href={`/meetups/${meetup.id}`}>{meetup.title}</Link>
          <span className="meta"> · {meetupRangeLabel(meetup.dates)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function MeetupsPage() {
  // 데이터베이스 문제는 모임 화면에서만 안내하고, 문서 뷰어에는 영향을 주지 않는다.
  let meetups: MeetupRecord[] = [];
  let problem: string | null = null;
  const db = getDbOrNull();
  if (!db) {
    problem = "데이터베이스가 설정되지 않아서 모임을 불러올 수 없어요.";
  } else {
    try {
      meetups = await listMeetups(db);
    } catch (error) {
      console.error("모임을 불러오지 못했어요", error);
      problem = "모임을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
    }
  }

  const canEdit = await hasEditSession();

  return (
    <main className="page">
      <h1>모임</h1>
      <p className="meta">후보 날짜에서 각자 가능한 시간을 표시하면, 모두가 되는 시간을 찾아 줘요.</p>

      {problem && <p className="banner">{problem}</p>}
      {!problem && <MeetupCreator canEdit={canEdit} today={todayInSeoul()} />}

      <section className="group">
        <h2>열린 모임</h2>
        <MeetupList meetups={meetups.filter((meetup) => meetup.status === "open")} empty="열린 모임이 없어요." />
      </section>
      <section className="group">
        <h2>확정된 모임</h2>
        <MeetupList meetups={meetups.filter((meetup) => meetup.status === "confirmed")} empty="확정된 모임이 없어요." />
      </section>
    </main>
  );
}
