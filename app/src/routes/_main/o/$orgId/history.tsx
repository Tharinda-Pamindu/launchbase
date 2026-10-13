import { Link, createFileRoute } from "@tanstack/react-router";
import { History as HistoryIcon } from "lucide-react";
import { usePlanList } from "@/api/endpoints/plans/plans";
import { ShippedBadge, StatusBadge } from "@/components/plan/status";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
} from "@/components/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrg } from "@/contexts/org-context";
import { weekLabel, weekRange } from "@/lib/week";

export const Route = createFileRoute("/_main/o/$orgId/history")({
  component: History,
});

function History() {
  const org = useOrg();
  const plans = usePlanList(org.id, { limit: 52 });
  const items = plans.data?.items ?? [];
  const closed = items.filter((p) => p.status === "done");
  const shipped = closed.filter((p) => p.main_goal_shipped).length;

  return (
    <>
      <PageHeader
        title="My past weeks"
        description={
          closed.length > 0
            ? `You shipped your main task in ${shipped} of ${closed.length} closed weeks.`
            : "Every week you plan ends up here."
        }
      />
      {plans.isLoading ? (
        <PageLoader />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No plans yet"
          description="Your first plan starts on My week."
        />
      ) : (
        <div className="rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Main task</TableHead>
                <TableHead>Tasks done</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      to="/o/$orgId/plans/$planId"
                      params={{ orgId: org.id, planId: plan.id }}
                      className="font-medium hover:underline"
                    >
                      {weekLabel(plan.week_start)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {weekRange(plan.week_start)}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {plan.tasks.find((t) => t.kind === "main")?.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    {plan.tasks.filter((t) => t.is_done).length}/
                    {plan.tasks.length}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={plan.status} />
                      <ShippedBadge shipped={plan.main_goal_shipped} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
