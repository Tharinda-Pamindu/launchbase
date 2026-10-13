import { useEffect } from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useOrganizationGet } from "@/api/endpoints/organizations/organizations";
import { ErrorState, PageLoader } from "@/components/states";
import { OrgProvider, rememberOrg } from "@/contexts/org-context";

// Everything under /o/$orgId runs inside one organization. The API decides
// whether the caller may see it (404 for strangers, 403 when suspended); the
// page just explains what came back.
export const Route = createFileRoute("/_main/o/$orgId")({
  component: OrgLayout,
});

function OrgLayout() {
  const { orgId } = Route.useParams();
  const org = useOrganizationGet(orgId, { query: { retry: false } });

  useEffect(() => {
    if (org.data) {
      rememberOrg(org.data.id);
    }
  }, [org.data]);

  if (org.isLoading) {
    return <PageLoader />;
  }
  if (org.isError || !org.data) {
    return (
      <ErrorState
        error={org.error}
        notFound="This organization doesn't exist, or you're not a member of it."
        onRetry={() => org.refetch()}
      />
    );
  }
  return (
    <OrgProvider org={org.data}>
      <Outlet />
    </OrgProvider>
  );
}
