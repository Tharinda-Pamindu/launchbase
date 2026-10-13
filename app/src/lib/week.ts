// Weeks are identified by their Monday, as an ISO date string ("2026-10-12"),
// the same key the API uses. Dates are handled as local calendar days.

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function currentMonday(): string {
  const today = new Date();
  const offset = (today.getDay() + 6) % 7; // Monday = 0
  today.setDate(today.getDate() - offset);
  return toIso(today);
}

export function addWeeks(monday: string, weeks: number): string {
  const date = fromIso(monday);
  date.setDate(date.getDate() + weeks * 7);
  return toIso(date);
}

export function isMonday(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && fromIso(iso).getDay() === 1;
}

// The API accepts new plans for last week, this week and next week.
export function canPlanWeek(monday: string): boolean {
  const now = currentMonday();
  return [addWeeks(now, -1), now, addWeeks(now, 1)].includes(monday);
}

export function weekLabel(monday: string): string {
  const now = currentMonday();
  if (monday === now) {
    return "This week";
  }
  if (monday === addWeeks(now, -1)) {
    return "Last week";
  }
  if (monday === addWeeks(now, 1)) {
    return "Next week";
  }
  return `Week of ${formatDay(monday)}`;
}

export function weekRange(monday: string): string {
  return `${formatDay(monday)} – ${formatDay(monday, 4)}`;
}

function formatDay(iso: string, plusDays = 0): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + plusDays);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
