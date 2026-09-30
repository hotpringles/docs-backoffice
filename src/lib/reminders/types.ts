/** 오늘 알려야 하는 일정 하나. `offsetDays`는 일정 며칠 전인지(0=당일). */
export type ReminderItem = {
  eventId: number;
  title: string;
  date: string;
  startTime: string | null;
  offsetDays: number;
};
