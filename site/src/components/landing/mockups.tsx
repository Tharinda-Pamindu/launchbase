import { Check, Crown, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Rendered product examples for the landing page. They are built from the
// same shapes the app shows (plans, review findings, the team's week), not
// screenshots or stock art, so they stay sharp and readable on any screen.

function Frame({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border bg-background p-4 shadow-sm sm:p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "amber" | "sky" | "emerald" | "muted";
  children: React.ReactNode;
}) {
  const tones = {
    amber: "bg-amber-100 text-amber-900",
    sky: "bg-sky-100 text-sky-900",
    emerald: "bg-emerald-100 text-emerald-900",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

function Task({
  done,
  children,
  hint,
}: {
  done?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
          done && "border-foreground bg-foreground text-background"
        )}
      >
        {done && <Check className="size-3" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "text-sm",
            done && "text-muted-foreground line-through"
          )}
        >
          {children}
        </span>
        {hint && (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
    </li>
  );
}

// Hero: one engineer's approved plan, mid-week.
export function PlanCardMock() {
  return (
    <Frame className="text-left">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Marco&apos;s week</p>
          <p className="text-xs text-muted-foreground">
            Mon Oct 12 – Fri Oct 16
          </p>
        </div>
        <Pill tone="sky">Approved by Leila</Pill>
      </div>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Main task
      </p>
      <ul className="mt-2 space-y-2">
        <Task hint="Why: finance teams ask for it in every renewal call">
          Invoices export to CSV for any date range, checked with a 10k-row
          account
        </Task>
      </ul>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Sub-goals
      </p>
      <ul className="mt-2 space-y-2">
        <Task done>
          Export streams rows without timing out on large accounts
        </Task>
        <Task done>Date-range picker remembers the last range used</Task>
      </ul>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Go-to-market
      </p>
      <ul className="mt-2 space-y-2">
        <Task>Help-center article on exports live</Task>
        <Task>export_invoice event in analytics</Task>
      </ul>
      <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div className="h-1.5 w-2/5 rounded-full bg-[#FF5722]" />
        </div>
        2 of 5 done · Wednesday
      </div>
    </Frame>
  );
}

function Finding({
  label,
  problem,
  rewrite,
  action = "Apply",
}: {
  label: string;
  problem: string;
  rewrite: string;
  action?: string;
}) {
  return (
    <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <Lightbulb className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-muted-foreground">{problem}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-background px-2 py-1">{rewrite}</span>
        <span className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background">
          {action}
        </span>
      </div>
    </div>
  );
}

// The AI section: a vague plan, flagged task by task, with rewrites.
export function ReviewMock() {
  return (
    <Frame className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Floppy suggests some changes</p>
          <p className="text-muted-foreground">
            Your main task is work, not a result, and nothing tells users it
            exists. Fix those and this is approvable.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Main task
        </p>
        <p className="rounded-md border px-3 py-2 text-sm">
          Implement checkout
        </p>
        <Finding
          label="Not a checkable result"
          problem={
            '"Implement checkout" is work to do. What will be true on Friday?'
          }
          rewrite="Checkout takes card payments end to end, confirmed on staging"
        />
        <Finding
          label="Missing why"
          problem="Nobody can approve this without knowing who is waiting for it."
          rewrite="Why: Team-plan customers can't upgrade without it"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sub-goals
        </p>
        <p className="rounded-md border px-3 py-2 text-sm">
          Work on the webhook bug
        </p>
        <Finding
          label="Not a checkable result"
          problem="Which bug, fixed how? Fill in the blanks so your lead can tick it on Friday."
          rewrite="Webhook [which bug] no longer [symptom], confirmed on staging"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Go-to-market
        </p>
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Nothing yet
        </p>
        <Finding
          label="No go-to-market"
          problem="Shipping checkout quietly means nobody uses it next week."
          rewrite="Changelog entry for the new checkout published"
          action="Add this task"
        />
      </div>
    </Frame>
  );
}

const TEAM = [
  {
    name: "Leila",
    lead: true,
    task: "Checkout retries expired cards",
    status: "Approved",
    tone: "sky",
    done: [1, 3],
  },
  {
    name: "Marco",
    task: "Invoices export to CSV",
    status: "Approved",
    tone: "sky",
    done: [2, 5],
  },
  {
    name: "Priya",
    task: "Refunds in one step from admin",
    status: "Waiting",
    tone: "amber",
    done: null,
  },
  {
    name: "Tom",
    task: "Still drafting",
    status: "Draft",
    tone: "muted",
    done: null,
  },
] as const;

// For leads: the team's week at a glance.
export function TeamWeekMock() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Payments · this week</p>
        <p className="text-xs text-muted-foreground">
          3 of 4 submitted · 2 approved
        </p>
      </div>
      <ul className="mt-3 divide-y">
        {TEAM.map((row) => (
          <li key={row.name} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="w-16 shrink-0 font-medium">
              {row.name}
              {"lead" in row && (
                <Crown className="ml-1 inline size-3 text-amber-500" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                row.status === "Draft" && "text-muted-foreground italic"
              )}
            >
              {row.task}
            </span>
            <span className="hidden w-12 text-right text-xs text-muted-foreground tabular-nums sm:block">
              {row.done ? `${row.done[0]}/${row.done[1]}` : "—"}
            </span>
            <Pill tone={row.tone}>{row.status}</Pill>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
        {[
          ["Last week", "3 of 4 shipped"],
          ["2 weeks ago", "2 of 4 shipped"],
          ["3 weeks ago", "1 of 3 shipped"],
        ].map(([week, result]) => (
          <div key={week} className="rounded-md bg-muted/60 p-2">
            <p className="text-muted-foreground">{week}</p>
            <p className="font-medium">{result}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}
