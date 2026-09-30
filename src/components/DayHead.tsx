import { shortDayLabel } from "@/lib/calendar/view";

/**
 * 모임 표의 날짜 머리글. "10/3(토)"를 날짜와 요일 두 줄로 나눠서, 폰에서 여러 날짜 열이 좁아도 잘리지 않게 한다.
 * (두 줄이어도 화면 낭독기에는 "10/3(토)" 한 덩어리로 읽힌다.)
 */
export function DayHead({ day }: { day: string }) {
  const label = shortDayLabel(day); // "10/3(토)"
  const split = label.indexOf("(");
  return (
    <>
      <span className="dh-date">{label.slice(0, split)}</span>
      <span className="dh-wd">{label.slice(split)}</span>
    </>
  );
}
