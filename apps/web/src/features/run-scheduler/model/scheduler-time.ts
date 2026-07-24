export type SchedulerTimeDisplay = {
  relative: string;
  absolute: string;
};

function relativeParts(seconds: number): [number, Intl.RelativeTimeFormatUnit] {
  const absolute = Math.abs(seconds);
  if (absolute < 60) return [seconds, 'second'];
  if (absolute < 3_600) return [Math.round(seconds / 60), 'minute'];
  if (absolute < 86_400) return [Math.round(seconds / 3_600), 'hour'];
  return [Math.round(seconds / 86_400), 'day'];
}

export function formatSchedulerTimestamp(
  value: string | undefined,
  { locale, now, timeZone }: { locale: string; now: number; timeZone?: string }
): SchedulerTimeDisplay | null {
  if (!value) return null;

  const timestamp = new Date(value);
  const timestampMs = timestamp.getTime();
  if (!Number.isFinite(timestampMs)) return null;

  const seconds = Math.round((timestampMs - now) / 1_000);
  const [amount, unit] = relativeParts(seconds);

  return {
    relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit),
    absolute: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone
    }).format(timestamp)
  };
}
