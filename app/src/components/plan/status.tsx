import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addWeeks, currentMonday, weekLabel, weekRange } from "@/lib/week";

type Status = "not_started" | "draft" | "submitted" | "approved" | "done";

const STATUS: Record<Status, { label: string; className: string }> = {
  not_started: {
    label: "Not started",
    className: "bg-muted text-muted-foreground",
  },
  draft: { label: "Draft", className: "bg-muted text-foreground" },
  submitted: {
    label: "Waiting for approval",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  },
  approved: {
    label: "Approved",
    className: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
  },
  done: {
    label: "Week closed",
    className:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, className } = STATUS[status];
  return <Badge className={cn("border-transparent", className)}>{label}</Badge>;
}

export function ShippedBadge({ shipped }: { shipped: boolean | null }) {
  if (shipped === null) {
    return null;
  }
  return shipped ? (
    <Badge className="border-transparent bg-emerald-600 text-white">
      Shipped
    </Badge>
  ) : (
    <Badge variant="outline">Didn&apos;t ship</Badge>
  );
}

export function WeekPicker({
  week,
  onChange,
  maxWeek = addWeeks(currentMonday(), 1),
}: {
  week: string;
  onChange: (week: string) => void;
  maxWeek?: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous week"
        onClick={() => onChange(addWeeks(week, -1))}
      >
        <ChevronLeft />
      </Button>
      <div className="min-w-36 px-2 text-center">
        <p className="text-sm font-medium">{weekLabel(week)}</p>
        <p className="text-xs text-muted-foreground">{weekRange(week)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next week"
        disabled={week >= maxWeek}
        onClick={() => onChange(addWeeks(week, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export const TASK_KINDS = {
  main: {
    label: "Main task",
    hint: "The one significant thing to ship this week, and why it matters.",
  },
  sub_goal: {
    label: "Sub-goals",
    hint: "Smaller tasks that get the main task over the line.",
  },
  gtm: {
    label: "Go-to-market",
    hint: "Put the work in front of users: a changelog entry, analytics, onboarding, a flag rollout.",
  },
} as const;
