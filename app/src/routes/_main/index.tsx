import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useOrganizationList } from "@/api/endpoints/organizations/organizations";
import { ErrorState, PageLoader } from "@/components/states";
import { lastOrg } from "@/contexts/org-context";

// `/` sends people to their week in the organization they used last, or to
// the welcome page to create or join one.
export const Route = createFileRoute("/_main/")({ component: Home });

function Home() {
  const orgs = useOrganizationList();

  if (orgs.isLoading) {
    return <PageLoader />;
  }
  if (orgs.isError) {
    return <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />;
  }

  const usable = (orgs.data ?? []).filter((o) => !o.is_suspended);
  const target = usable.find((o) => o.id === lastOrg()) ?? usable[0];
  if (!target) {
    return <Navigate to="/welcome" replace />;
  }
  return <Navigate to="/o/$orgId/week" params={{ orgId: target.id }} replace />;
}
