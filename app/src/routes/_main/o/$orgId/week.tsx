import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarClock, PenLine, WandSparkles } from "lucide-react";
import { useAiStatus } from "@/api/endpoints/ai/ai";
import { usePlanList } from "@/api/endpoints/plans/plans";
import type { PlanResponse } from "@/api/model";
import { PlanEditor } from "@/components/plan/plan-editor";
import { PlanView } from "@/components/plan/plan-view";
import { WeekPicker } from "@/components/plan/status";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
} from "@/components/states";
import { Button } from "@/components/ui/button";
import { useInvalidateOrg, useOrg } from "@/contexts/org-context";
import { canPlanWeek, currentMonday, isMonday, weekLabel } from "@/lib/week";

export const Route = createFileRoute("/_main/o/$orgId/week")({
  validateSearch: (search: Record<string, unknown>): { week?: string } => ({
    week:
      typeof search["week"] === "string" && isMonday(search["week"])
        ? search["week"]
        : undefined,
  }),
  component: MyWeek,
});

function MyWeek() {
  const org = useOrg();
  const navigate = useNavigate({ from: Route.fullPath });
  const week = Route.useSearch().week ?? currentMonday();
  const plans = usePlanList(org.id, { week_start: week });
  const invalidate = useInvalidateOrg();
  const [writing, setWriting] = useState<"blank" | "notes" | null>(null);
  const aiAvailable = useAiStatus().data?.available ?? false;
  const plan = plans.data?.items[0];

  const setWeek = (next: string) => {
    setWriting(null);
    navigate({ search: { week: next === currentMonday() ? undefined : next } });
  };
  const onChange = (_: PlanResponse) => {
    void invalidate(org.id);
  };

  return (
    <>
      <PageHeader
        title="My week"
        description="One significant thing to ship by Friday, the sub-goals that get it there, and how users will hear about it."
        actions={<WeekPicker week={week} onChange={setWeek} />}
      />
      {plans.isLoading ? (
        <PageLoader />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : plan ? (
        plan.permissions.edit ? (
          <PlanEditor
            key={plan.id}
            organizationId={org.id}
            week={week}
            plan={plan}
            onSaved={onChange}
          />
        ) : (
          <PlanView
            organizationId={org.id}
            plan={plan}
            isMine
            onChange={onChange}
          />
        )
      ) : writing ? (
        <PlanEditor
          key={week}
          organizationId={org.id}
          week={week}
          onSaved={onChange}
          startWithNotes={writing === "notes"}
        />
      ) : canPlanWeek(week) ? (
        <EmptyState
          icon={PenLine}
          title={`No plan for ${weekLabel(week).toLowerCase()} yet`}
          description={
            aiAvailable
              ? "Write it yourself, or paste your notes and let Floppy draft it."
              : "Start with the one thing you want to ship by Friday."
          }
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setWriting("blank")}>Write my plan</Button>
            {aiAvailable && (
              <Button variant="outline" onClick={() => setWriting("notes")}>
                <WandSparkles />
                Draft from my notes
              </Button>
            )}
          </div>
        </EmptyState>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="No plan this week"
          description="You can plan last week, this week or next week."
        />
      )}
    </>
  );
}
