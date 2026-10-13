import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Crown, Lock, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useMemberList } from "@/api/endpoints/members/members";
import {
  useTeamDelete,
  useTeamGet,
  useTeamMemberRemove,
  useTeamMemberSet,
  useTeamWeekGet,
  useTeamWeekList,
} from "@/api/endpoints/teams/teams";
import type { TeamResponse } from "@/api/model";
import {
  ShippedBadge,
  StatusBadge,
  WeekPicker,
} from "@/components/plan/status";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
} from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInvalidateOrg, useOrg } from "@/contexts/org-context";
import { useCurrentUser } from "@/contexts/user-context";
import { errorMessage } from "@/lib/errors";
import { currentMonday, isMonday, weekLabel, weekRange } from "@/lib/week";

export const Route = createFileRoute("/_main/o/$orgId/teams/$teamId")({
  validateSearch: (search: Record<string, unknown>): { week?: string } => ({
    week:
      typeof search["week"] === "string" && isMonday(search["week"])
        ? search["week"]
        : undefined,
  }),
  component: TeamPage,
});

function TeamPage() {
  const { teamId } = Route.useParams();
  const org = useOrg();
  const user = useCurrentUser();
  const team = useTeamGet(org.id, teamId, { query: { retry: false } });

  if (team.isLoading) {
    return <PageLoader />;
  }
  if (team.isError || !team.data) {
    return (
      <ErrorState
        error={team.error}
        notFound="This team doesn't exist in this organization."
        onRetry={() => team.refetch()}
      />
    );
  }

  const data = team.data;
  const isLead = data.members.some((m) => m.user_id === user?.id && m.is_lead);
  const canSeeWeek = isLead || org.isManager;

  return (
    <>
      <PageHeader
        title={data.name}
        description={data.description ?? undefined}
        actions={org.isManager && <DeleteTeamButton team={data} />}
      />
      {canSeeWeek ? (
        <>
          <TeamWeek team={data} />
          <TeamHistory team={data} />
        </>
      ) : (
        <EmptyState
          icon={Lock}
          title="Only the team lead and admins see the team's week"
          description="You can see who's on the team below. Your own plan is on My week."
        />
      )}
      <TeamMembers team={data} />
    </>
  );
}

function TeamWeek({ team }: { team: TeamResponse }) {
  const org = useOrg();
  const navigate = useNavigate({ from: Route.fullPath });
  const week = Route.useSearch().week ?? currentMonday();
  const teamWeek = useTeamWeekGet(org.id, team.id, week);
  const members = teamWeek.data?.members ?? [];
  const count = (status: string[]) =>
    members.filter((m) => status.includes(m.status)).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">The team&apos;s week</h2>
          {teamWeek.data && (
            <p className="text-sm text-muted-foreground">
              {count(["submitted", "approved", "done"])} of {members.length}{" "}
              submitted · {count(["approved", "done"])} approved ·{" "}
              {members.filter((m) => m.main_goal_shipped).length} shipped
            </p>
          )}
        </div>
        <WeekPicker
          week={week}
          onChange={(next) =>
            navigate({
              search: { week: next === currentMonday() ? undefined : next },
            })
          }
        />
      </div>
      {teamWeek.isLoading ? (
        <PageLoader />
      ) : teamWeek.isError ? (
        <ErrorState error={teamWeek.error} onRetry={() => teamWeek.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Nobody on this team yet"
          description="Add people below."
        />
      ) : (
        <div className="rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Main task</TableHead>
                <TableHead className="w-40">Tasks done</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {m.first_name} {m.last_name}
                    {m.is_lead && (
                      <Crown className="ml-1 inline size-3.5 text-amber-500" />
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm">
                    {m.plan_id ? (
                      <Link
                        to="/o/$orgId/plans/$planId"
                        params={{ orgId: org.id, planId: m.plan_id }}
                        className="line-clamp-2 hover:underline"
                      >
                        {m.main_task_title ?? "Open plan"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {m.status === "draft"
                          ? "Still drafting (private)"
                          : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.tasks_total ? (
                      <div className="flex items-center gap-2">
                        <Progress
                          className="w-20"
                          value={((m.tasks_done ?? 0) / m.tasks_total) * 100}
                        />
                        <span className="text-xs text-muted-foreground">
                          {m.tasks_done}/{m.tasks_total}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={m.status} />
                      <ShippedBadge shipped={m.main_goal_shipped} />
                    </div>
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

function TeamHistory({ team }: { team: TeamResponse }) {
  const org = useOrg();
  const navigate = useNavigate({ from: Route.fullPath });
  const history = useTeamWeekList(org.id, team.id, { limit: 12 });
  const weeks = history.data?.items ?? [];
  if (history.isLoading || weeks.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Past weeks</h2>
      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Main task shipped</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeks.map((w) => (
              <TableRow
                key={w.week_start}
                className="cursor-pointer"
                onClick={() =>
                  navigate({
                    search: {
                      week:
                        w.week_start === currentMonday()
                          ? undefined
                          : w.week_start,
                    },
                  })
                }
              >
                <TableCell>
                  <span className="font-medium">{weekLabel(w.week_start)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {weekRange(w.week_start)}
                  </span>
                </TableCell>
                <TableCell>
                  {w.submitted}/{w.member_count}
                </TableCell>
                <TableCell>
                  {w.approved}/{w.member_count}
                </TableCell>
                <TableCell>
                  {w.closed > 0 ? `${w.shipped} of ${w.closed} closed` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function TeamMembers({ team }: { team: TeamResponse }) {
  const org = useOrg();
  const invalidate = useInvalidateOrg();
  const members = useMemberList(org.id, { query: { enabled: org.isManager } });
  const setMember = useTeamMemberSet();
  const removeMember = useTeamMemberRemove();
  const [adding, setAdding] = useState("");
  const onTeam = new Set(team.members.map((m) => m.user_id));
  const candidates = (members.data ?? []).filter((m) => !onTeam.has(m.user_id));
  const pending = setMember.isPending || removeMember.isPending;
  const handlers = {
    onSuccess: () => void invalidate(org.id),
    onError: (error: unknown) => toast.error(errorMessage(error)),
  };

  const set = (userId: string, isLead: boolean) =>
    setMember.mutate(
      {
        organizationId: org.id,
        teamId: team.id,
        userId,
        data: { is_lead: isLead },
      },
      handlers
    );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">People</h2>
      <div className="divide-y rounded-xl border bg-background">
        {team.members.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Nobody yet.</p>
        )}
        {team.members.map((m) => (
          <div
            key={m.user_id}
            className="flex flex-wrap items-center gap-2 p-3"
          >
            <span className="font-medium">
              {m.first_name} {m.last_name}
            </span>
            {m.is_lead && <Badge>Lead</Badge>}
            {org.isManager && (
              <div className="ml-auto flex gap-1">
                {!m.is_lead && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => set(m.user_id, true)}
                  >
                    <Crown />
                    Make lead
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    removeMember.mutate(
                      {
                        organizationId: org.id,
                        teamId: team.id,
                        userId: m.user_id,
                      },
                      handlers
                    )
                  }
                >
                  <UserMinus />
                  Remove
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {org.isManager && (
        <div className="flex flex-wrap items-center gap-2">
          {candidates.length > 0 ? (
            <>
              <NativeSelect
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                aria-label="Person to add"
              >
                <NativeSelectOption value="">
                  Add someone from the organization…
                </NativeSelectOption>
                {candidates.map((m) => (
                  <NativeSelectOption key={m.user_id} value={m.user_id}>
                    {m.first_name} {m.last_name} ({m.email})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                disabled={!adding || pending}
                onClick={() => {
                  set(adding, false);
                  setAdding("");
                }}
              >
                <UserPlus />
                Add to team
              </Button>
            </>
          ) : (
            members.isSuccess && (
              <p className="text-sm text-muted-foreground">
                Everyone in the organization is on this team.{" "}
                <Link
                  to="/o/$orgId/settings"
                  params={{ orgId: org.id }}
                  className="underline"
                >
                  Invite more people
                </Link>
                .
              </p>
            )
          )}
        </div>
      )}
    </section>
  );
}

function DeleteTeamButton({ team }: { team: TeamResponse }) {
  const org = useOrg();
  const navigate = useNavigate();
  const invalidate = useInvalidateOrg();
  const remove = useTeamDelete();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        <Trash2 />
        Delete team
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        Plans are kept. Delete the team?
      </span>
      <Button
        variant="outline"
        onClick={() => setConfirming(false)}
        disabled={remove.isPending}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate(
            { organizationId: org.id, teamId: team.id },
            {
              onSuccess: () => {
                void invalidate(org.id);
                navigate({ to: "/o/$orgId/teams", params: { orgId: org.id } });
              },
              onError: (error) => toast.error(errorMessage(error)),
            }
          )
        }
      >
        Delete
      </Button>
    </div>
  );
}
