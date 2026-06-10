const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const monthDayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const dayLabelFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function sameDay(aIso: string, bIso: string): boolean {
  return isSameDay(new Date(aIso), new Date(bIso));
}

/** Compact timestamp for chat-list rows: time today, date otherwise. */
export function shortTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (isSameDay(date, now)) return timeFormat.format(date);
  if (date.getFullYear() === now.getFullYear())
    return monthDayFormat.format(date);
  return fullDateFormat.format(date);
}

export function bubbleTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** Day-separator label: Today / Yesterday / full date. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return dayLabelFormat.format(date);
}
