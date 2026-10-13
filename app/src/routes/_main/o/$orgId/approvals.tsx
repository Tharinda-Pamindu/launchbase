import { Link, createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useApprovalList } from "@/api/endpoints/plans/plans";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
} from "@/components/states";
import { useOrg } from "@/contexts/org-context";
import { formatDateTime, weekLabel } from "@/lib/week";

export const Route = createFileRoute("/_main/o/$orgId/approvals")({
  component: Approvals,
});

function Approvals() {
  const org = useOrg();
  const approvals = useApprovalList(org.id);

  return (
    <>
      <PageHeader
        title="Waiting for my approval"
        description="Plans from your teams that need a yes or a comment before the week gets going."
      />
      {approvals.isLoading ? (
        <PageLoader />
      ) : approvals.isError ? (
        <ErrorState
          error={approvals.error}
          onRetry={() => approvals.refetch()}
        />
      ) : approvals.data?.length ? (
        <div className="space-y-3">
          {approvals.data.map((plan) => {
            const main = plan.tasks.find((t) => t.kind === "main");
            return (
              <Link
                key={plan.id}
                to="/o/$orgId/plans/$planId"
                params={{ orgId: org.id, planId: plan.id }}
                className="block rounded-xl border bg-background p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{plan.author_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {weekLabel(plan.week_start)}
                    {plan.submitted_at &&
                      ` · submitted ${formatDateTime(plan.submitted_at)}`}
                  </span>
                </div>
                <p className="mt-1 text-sm">{main?.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.tasks.length} tasks
                  {plan.total_estimate_hours > 0 &&
                    ` · ${plan.total_estimate_hours}h estimated`}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting for you"
          description="When someone on a team you lead submits a plan, it shows up here."
        />
      )}
    </>
  );
}
