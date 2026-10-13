import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { useTeamCreate, useTeamList } from "@/api/endpoints/teams/teams";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useInvalidateOrg, useOrg } from "@/contexts/org-context";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_main/o/$orgId/teams/")({
  component: Teams,
});

function Teams() {
  const org = useOrg();
  const teams = useTeamList(org.id);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Teams"
        description="Each team has a lead who approves its members' plans and sees the team's week."
        actions={
          org.isManager && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New team
            </Button>
          )
        }
      />
      {teams.isLoading ? (
        <PageLoader />
      ) : teams.isError ? (
        <ErrorState error={teams.error} onRetry={() => teams.refetch()} />
      ) : teams.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.data.map((team) => {
            const lead = team.members.find((m) => m.is_lead);
            return (
              <Link
                key={team.id}
                to="/o/$orgId/teams/$teamId"
                params={{ orgId: org.id, teamId: team.id }}
                className="rounded-xl border bg-background p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{team.name}</span>
                  <Badge variant="outline">{team.members.length} people</Badge>
                </div>
                {team.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {team.description}
                  </p>
                )}
                <p className="mt-3 text-sm">
                  {lead ? (
                    <>
                      Lead: {lead.first_name} {lead.last_name}
                    </>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">
                      No lead yet, so nobody can approve plans
                    </span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No teams yet"
          description={
            org.isManager
              ? "Create a team, add people and pick a lead. Plans are approved by the lead of the author's team."
              : "An owner or admin needs to create a team and add you to it before your plans can be approved."
          }
        >
          {org.isManager && (
            <Button onClick={() => setCreating(true)}>Create a team</Button>
          )}
        </EmptyState>
      )}
      <CreateTeamDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function CreateTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const org = useOrg();
  const navigate = useNavigate();
  const invalidate = useInvalidateOrg();
  const create = useTeamCreate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = () =>
    create.mutate(
      {
        organizationId: org.id,
        data: { name: name.trim(), description: description.trim() || null },
      },
      {
        onSuccess: (team) => {
          void invalidate(org.id);
          onOpenChange(false);
          setName("");
          setDescription("");
          navigate({
            to: "/o/$orgId/teams/$teamId",
            params: { orgId: org.id, teamId: team.id },
          });
        },
      }
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !create.isPending && onOpenChange(next)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>
            Next you&apos;ll add people and choose a lead.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Payments"
          maxLength={100}
          aria-label="Team name"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What the team works on (optional)"
          maxLength={500}
          aria-label="Description"
        />
        {create.isError && (
          <p className="text-sm text-destructive">
            {errorMessage(create.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={!name.trim() || create.isPending} onClick={submit}>
            {create.isPending && <Spinner />}
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
