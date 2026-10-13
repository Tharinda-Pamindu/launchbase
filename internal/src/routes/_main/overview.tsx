import { Link, createFileRoute } from "@tanstack/react-router";
import { useAiUsageSummary } from "@/api/endpoints/ai-usage/ai-usage";
import { useOrganizationList } from "@/api/endpoints/organizations/organizations";
import { useUserList } from "@/api/endpoints/users/users";
import { PageHeader, Stat } from "@/components/states";
import { useCurrentUser } from "@/contexts/user-context";

export const Route = createFileRoute("/_main/overview")({
  component: Overview,
});

function Overview() {
  const user = useCurrentUser();
  // limit 1: only the totals are needed here.
  const orgs = useOrganizationList({ limit: 1 });
  const suspended = useOrganizationList({ status: "suspended", limit: 1 });
  const users = useUserList({ limit: 1 });
  const ai = useAiUsageSummary({ days: 7 });
  const summary = ai.data;
  const failureRate =
    summary && summary.calls > 0
      ? Math.round(
          ((summary.failed + summary.rate_limited) / summary.calls) * 100
        )
      : null;

  return (
    <>
      <PageHeader
        title={`Hi${user ? `, ${user.first_name}` : ""}`}
        description="How Floppy is doing across every customer organization."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Organizations"
          value={orgs.data?.total ?? "—"}
          hint={
            suspended.data?.total ? (
              <Link
                to="/organizations"
                search={{ status: "suspended" }}
                className="underline"
              >
                {suspended.data.total} suspended
              </Link>
            ) : (
              "None suspended"
            )
          }
        />
        <Stat
          label="User accounts"
          value={users.data?.total ?? "—"}
          hint="Customers and staff"
        />
        <Stat
          label="AI calls, last 7 days"
          value={summary?.calls ?? "—"}
          hint={
            summary
              ? `${(summary.input_tokens + summary.output_tokens).toLocaleString()} tokens`
              : undefined
          }
        />
        <Stat
          label="AI calls that didn't succeed"
          value={failureRate === null ? "—" : `${failureRate}%`}
          hint={
            summary
              ? `${summary.failed} failed · ${summary.rate_limited} rate-limited`
              : undefined
          }
        />
      </div>
      {summary && summary.organizations.length > 0 && (
        <div className="rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Heaviest AI users this week</h2>
            <Link to="/ai-usage" className="text-sm underline">
              All AI usage
            </Link>
          </div>
          <ul className="mt-3 divide-y text-sm">
            {summary.organizations.slice(0, 5).map((org) => (
              <li
                key={org.organization_id}
                className="flex items-center justify-between py-2"
              >
                <Link
                  to="/organizations/$orgId"
                  params={{ orgId: org.organization_id }}
                  className="font-medium hover:underline"
                >
                  {org.organization_name}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {org.calls} calls · {org.failed + org.rate_limited} not
                  successful
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
