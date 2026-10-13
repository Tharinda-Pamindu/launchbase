import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, EyeOff, RotateCcw } from "lucide-react";
import { useAiUsageEventList } from "@/api/endpoints/ai-usage/ai-usage";
import {
  getOrganizationGetQueryKey,
  useOrganizationGet,
  useOrganizationReinstate,
  useOrganizationSuspend,
} from "@/api/endpoints/organizations/organizations";
import type { OrganizationDetailResponse } from "@/api/model";
import {
  ErrorState,
  OutcomeBadge,
  PageHeader,
  PageLoader,
  Stat,
  errorKindLabel,
  formatDate,
  formatDateTime,
} from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api-error";

export const Route = createFileRoute("/_main/organizations/$orgId")({
  component: OrganizationPage,
});

const ROLE_LABELS = {
  owner: "Owner",
  admin: "Org admin",
  member: "Member",
} as const;

function OrganizationPage() {
  const { orgId } = Route.useParams();
  const org = useOrganizationGet(orgId, { query: { retry: false } });

  if (org.isLoading) {
    return <PageLoader />;
  }
  if (org.isError || !org.data) {
    return <ErrorState error={org.error} onRetry={() => org.refetch()} />;
  }
  const data = org.data;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.name}
            {data.suspended_at && (
              <Badge variant="destructive">Suspended</Badge>
            )}
          </span>
        }
        description={`Created ${formatDate(data.created_at)} · last active ${formatDateTime(data.last_active_at)}`}
        actions={<SuspendControl org={data} />}
      />
      {data.suspended_at && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          Suspended {formatDateTime(data.suspended_at)}. Members are locked out
          until it&apos;s reinstated. Reason: {data.suspended_reason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Members" value={data.member_count} />
        <Stat label="Teams" value={data.team_count} />
        <Stat label="Weekly plans" value={data.plan_count} />
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <EyeOff className="size-4" />
        Staff see who is in an organization and how it&apos;s organized, never
        what its people are planning. Plan text, comments and AI reviews stay
        with the customer.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role in this organization</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>
                    <Link
                      to="/users/$userId"
                      params={{ userId: m.user_id }}
                      className="font-medium hover:underline"
                    >
                      {m.first_name} {m.last_name}
                    </Link>
                    {!m.is_active && (
                      <Badge variant="outline" className="ml-2">
                        Deactivated
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell>{ROLE_LABELS[m.role]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.joined_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Teams</h2>
        {data.teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.teams.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border bg-background p-4 text-sm"
              >
                <p className="font-medium">{t.name}</p>
                <p className="text-muted-foreground">
                  {t.member_count} people ·{" "}
                  {t.lead_name ? `led by ${t.lead_name}` : "no lead"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <RecentAiCalls organizationId={data.id} />
    </>
  );
}

function RecentAiCalls({ organizationId }: { organizationId: string }) {
  const events = useAiUsageEventList({
    organization_id: organizationId,
    limit: 10,
  });
  const items = events.data?.items ?? [];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent AI calls</h2>
        <Link
          to="/ai-usage"
          search={{ organizationId }}
          className="text-sm underline"
        >
          All of this organization&apos;s AI usage
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {events.isLoading ? "Loading…" : "No AI calls yet."}
        </p>
      ) : (
        <div className="rounded-xl border bg-background">
          <Table>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(e.created_at)}
                  </TableCell>
                  <TableCell>
                    {e.operation === "plan_review"
                      ? "Plan review"
                      : "Draft from notes"}
                  </TableCell>
                  <TableCell>
                    <OutcomeBadge outcome={e.outcome} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {errorKindLabel(e.error_kind)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function SuspendControl({ org }: { org: OrganizationDetailResponse }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const onDone = (detail: OrganizationDetailResponse, message: string) => {
    toast.success(message);
    queryClient.setQueryData(getOrganizationGetQueryKey(org.id), detail);
    void queryClient.invalidateQueries({ queryKey: ["/organizations"] });
  };
  const suspend = useOrganizationSuspend({
    mutation: {
      onSuccess: (detail) => {
        setOpen(false);
        setReason("");
        onDone(detail, "Organization suspended. Its members are locked out.");
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Couldn't suspend")),
    },
  });
  const reinstate = useOrganizationReinstate({
    mutation: {
      onSuccess: (detail) => onDone(detail, "Organization reinstated"),
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Couldn't reinstate")),
    },
  });

  if (org.suspended_at) {
    return (
      <Button
        variant="outline"
        disabled={reinstate.isPending}
        onClick={() => reinstate.mutate({ organizationId: org.id })}
      >
        {reinstate.isPending ? <Spinner /> : <RotateCcw />}
        Reinstate
      </Button>
    );
  }
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Ban />
        Suspend
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => !suspend.isPending && setOpen(next)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {org.name}?</DialogTitle>
            <DialogDescription>
              All {org.member_count} members are locked out at once, until you
              reinstate it. Nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why, for the record (e.g. unpaid invoice, abuse report #123)"
            aria-label="Reason"
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={suspend.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || suspend.isPending}
              onClick={() =>
                suspend.mutate({
                  organizationId: org.id,
                  data: { reason: reason.trim() },
                })
              }
            >
              {suspend.isPending && <Spinner />}
              Suspend organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
