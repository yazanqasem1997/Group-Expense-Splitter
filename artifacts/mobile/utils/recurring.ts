import type { RecurringFrequency } from "@/context/AppContext";

export const FALLBACK_TIME_ZONE = "UTC";

export type RecurringInterval = {
  months?: number;
  weeks?: number;
  days?: number;
};

export function recurringIntervalLabel(config: {
  frequency: RecurringFrequency;
  customDays?: number;
  intervalMonths?: number;
  intervalWeeks?: number;
  intervalDays?: number;
}): string {
  const parts = [
    config.intervalMonths ? `${config.intervalMonths}m` : "",
    config.intervalWeeks ? `${config.intervalWeeks}w` : "",
    config.intervalDays ? `${config.intervalDays}d` : "",
  ].filter(Boolean);
  if (parts.length > 0) return `Every ${parts.join(" ")}`;
  if (config.frequency === "custom") return `Every ${config.customDays ?? 30}d`;
  return {
    weekly: "Every week",
    biweekly: "Every 2 weeks",
    monthly: "Every month",
    quarterly: "Every 3 months",
  }[config.frequency];
}

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function parseDateOnly(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function addRecurringInterval(
  dateOnly: string,
  frequency: RecurringFrequency,
  customDays?: number,
  interval?: RecurringInterval,
): string {
  const date = parseDateOnly(dateOnly);
  const hasExplicitInterval =
    interval?.months !== undefined ||
    interval?.weeks !== undefined ||
    interval?.days !== undefined;
  if (hasExplicitInterval) {
    const months = Math.max(0, interval?.months ?? 0);
    if (months > 0) {
      const originalDay = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + months);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(originalDay, lastDay));
    }
    date.setUTCDate(
      date.getUTCDate() +
        Math.max(0, interval?.weeks ?? 0) * 7 +
        Math.max(0, interval?.days ?? 0),
    );
    return formatDateOnly(date);
  }
  if (frequency === "monthly" || frequency === "quarterly") {
    const months = frequency === "monthly" ? 1 : 3;
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
    return formatDateOnly(date);
  }

  const days = frequency === "custom" ? Math.max(1, customDays ?? 30) : frequency === "biweekly" ? 14 : 7;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function getDateParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values: Record<string, number> = {};
  parts.forEach(part => {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  });
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function offsetAt(instant: Date, timeZone: string): number {
  const parts = getDateParts(instant, timeZone);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) -
    instant.getTime()
  );
}

export function dateOnlyInTimeZone(date: Date, timeZone?: string): string {
  const zone = timeZone || FALLBACK_TIME_ZONE;
  try {
    const { year, month, day } = getDateParts(date, zone);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    return formatDateOnly(date);
  }
}

/**
 * Converts a calendar date to the instant representing midnight in an IANA
 * timezone. The second offset lookup handles DST transitions around midnight.
 */
export function dateOnlyToInstant(dateOnly: string, timeZone?: string): string {
  const zone = timeZone || FALLBACK_TIME_ZONE;
  const [year, month, day] = dateOnly.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day);
  try {
    let instant = wallClock - offsetAt(new Date(wallClock), zone);
    instant = wallClock - offsetAt(new Date(instant), zone);
    return new Date(instant).toISOString();
  } catch {
    return new Date(`${dateOnly}T00:00:00Z`).toISOString();
  }
}

export function nextRecurringInstant(
  dueAt: string,
  frequency: RecurringFrequency,
  customDays?: number,
  timeZone?: string,
  interval?: RecurringInterval,
): string {
  const zone = timeZone || FALLBACK_TIME_ZONE;
  const dueDate = dateOnlyInTimeZone(new Date(dueAt), zone);
  return dateOnlyToInstant(addRecurringInterval(dueDate, frequency, customDays, interval), zone);
}