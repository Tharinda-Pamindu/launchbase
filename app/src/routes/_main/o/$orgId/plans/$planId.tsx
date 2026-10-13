import { createFileRoute } from "@tanstack/react-router";
import { usePlanGet } from "@/api/endpoints/plans/plans";
import { PlanEditor } from "@/components/plan/plan-editor";
import { PlanView } from "@/components/plan/plan-view";
import { ErrorState, PageHeader, PageLoader } from "@/components/states";
import { useInvalidateOrg, useOrg } from "@/contexts/org-context";
import { useCurrentUser } from "@/contexts/user-context";
import { weekLabel } from "@/lib/week";

export const Route = createFileRoute("/_main/o/$orgId/plans/$planId")({
  component: PlanPage,
});

function PlanPage() {
  const { planId } = Route.useParams();
  const org = useOrg();
  const user = useCurrentUser();
  const invalidate = useInvalidateOrg();
  const plan = usePlanGet(org.id, planId, { query: { retry: false } });
  const onChange = () => void invalidate(org.id);

  if (plan.isLoading) {
    return <PageLoader />;
  }
  if (plan.isError || !plan.data) {
    return (
      <ErrorState
        error={plan.error}
        notFound="This plan doesn't exist, or it isn't shared with you. Drafts stay private until they're submitted."
        onRetry={() => plan.refetch()}
      />
    );
  }

  const data = plan.data;
  const isMine = data.author_id === user?.id;
  return (
    <>
      <PageHeader
        title={
          isMine
            ? `My plan · ${weekLabel(data.week_start)}`
            : `${data.author_name}'s plan`
        }
        description={isMine ? undefined : weekLabel(data.week_start)}
      />
      {data.permissions.edit ? (
        <PlanEditor
          key={data.id}
          organizationId={org.id}
          week={data.week_start}
          plan={data}
          onSaved={onChange}
        />
      ) : (
        <PlanView
          organizationId={org.id}
          plan={data}
          isMine={isMine}
          onChange={onChange}
        />
      )}
    </>
  );
}
