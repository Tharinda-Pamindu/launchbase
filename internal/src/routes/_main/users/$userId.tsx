import { Link, createFileRoute } from "@tanstack/react-router";
import { useUserGet } from "@/api/endpoints/users/users";
import {
  ErrorState,
  PageHeader,
  PageLoader,
  formatDate,
} from "@/components/states";
import {
  ActiveToggleButton,
  UserStatusBadges,
} from "@/components/users/user-status";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/contexts/user-context";

export const Route = createFileRoute("/_main/users/$userId")({
  component: UserPage,
});

const ROLE_LABELS = {
  owner: "Owner",
  admin: "Org admin",
  member: "Member",
} as const;

function UserPage() {
  const { userId } = Route.useParams();
  const currentUser = useCurrentUser();
  const user = useUserGet(userId, { query: { retry: false } });

  if (user.isLoading) {
    return <PageLoader />;
  }
  if (user.isError || !user.data) {
    return <ErrorState error={user.error} onRetry={() => user.refetch()} />;
  }
  const data = user.data;
  const isSelf = currentUser?.id === data.id;

  return (
    <>
      <PageHeader
        title={`${data.first_name} ${data.last_name}`}
        description={`${data.email} · joined ${formatDate(data.created_at)}`}
        actions={
          isSelf ? (
            <span className="text-sm text-muted-foreground">
              You can&apos;t deactivate yourself.
            </span>
          ) : (
            <ActiveToggleButton user={data} />
          )
        }
      />
      <UserStatusBadges user={data} />
      {!data.is_active && (
        <p className="rounded-lg border bg-background p-3 text-sm">
          This account is deactivated: it was signed out everywhere and
          can&apos;t sign in. Reactivate it to restore access. Nothing was
          deleted.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Organizations</h2>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not a member of any organization.
          </p>
        ) : (
          <div className="divide-y rounded-xl border bg-background">
            {data.memberships.map((m) => (
              <div
                key={m.organization_id}
                className="flex flex-wrap items-center gap-2 p-3 text-sm"
              >
                <Link
                  to="/organizations/$orgId"
                  params={{ orgId: m.organization_id }}
                  className="font-medium hover:underline"
                >
                  {m.organization_name}
                </Link>
                <Badge variant="outline">{ROLE_LABELS[m.role]}</Badge>
                {m.organization_suspended && (
                  <Badge variant="destructive">Suspended</Badge>
                )}
                <span className="ml-auto text-muted-foreground">
                  joined {formatDate(m.joined_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
