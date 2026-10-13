import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, LogOut, Trash2 } from "lucide-react";
import {
  useInviteCreate,
  useInviteList,
  useInviteRevoke,
} from "@/api/endpoints/invites/invites";
import {
  useMemberList,
  useMemberRemove,
  useMemberUpdate,
} from "@/api/endpoints/members/members";
import {
  getOrganizationListQueryKey,
  useOrganizationLeave,
  useOrganizationUpdate,
} from "@/api/endpoints/organizations/organizations";
import type { InviteCreatedResponse, MemberResponse } from "@/api/model";
import { ErrorState, PageHeader, PageLoader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { useInvalidateOrg, useOrg } from "@/contexts/org-context";
import { useCurrentUser } from "@/contexts/user-context";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/week";

export const Route = createFileRoute("/_main/o/$orgId/settings")({
  component: Settings,
});

const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
} as const;

function Settings() {
  const org = useOrg();
  return (
    <>
      <PageHeader
        title="Organization"
        description={
          org.isManager
            ? "Name, people and invite links. Owners and admins manage these."
            : "Who's here. Only owners and admins can change these settings."
        }
      />
      {org.isManager && <NameCard />}
      <MembersCard />
      {org.isManager && <InvitesCard />}
      <LeaveCard />
    </>
  );
}

function NameCard() {
  const org = useOrg();
  const invalidate = useInvalidateOrg();
  const queryClient = useQueryClient();
  const update = useOrganizationUpdate();
  const [name, setName] = useState(org.name);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Name</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-label="Organization name"
        />
        <Button
          disabled={
            !name.trim() || name.trim() === org.name || update.isPending
          }
          onClick={() =>
            update.mutate(
              { organizationId: org.id, data: { name: name.trim() } },
              {
                onSuccess: () => {
                  toast.success("Renamed");
                  void invalidate(org.id);
                  void queryClient.invalidateQueries({
                    queryKey: getOrganizationListQueryKey(),
                  });
                },
                onError: (error) => toast.error(errorMessage(error)),
              }
            )
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function MembersCard() {
  const org = useOrg();
  const user = useCurrentUser();
  const members = useMemberList(org.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          Owners and admins manage people, teams and settings. Members plan
          their own weeks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.isLoading ? (
          <PageLoader />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : (
          <div className="divide-y rounded-lg border">
            {members.data?.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isMe={member.user_id === user?.id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  isMe,
}: {
  member: MemberResponse;
  isMe: boolean;
}) {
  const org = useOrg();
  const invalidate = useInvalidateOrg();
  const update = useMemberUpdate();
  const remove = useMemberRemove();
  // Owners manage everyone; org admins manage admins and members, never owners.
  const canManage =
    org.isManager && !isMe && (org.role === "owner" || member.role !== "owner");
  const roles =
    org.role === "owner"
      ? (["owner", "admin", "member"] as const)
      : (["admin", "member"] as const);
  const handlers = {
    onSuccess: () => void invalidate(org.id),
    onError: (error: unknown) => toast.error(errorMessage(error)),
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {member.first_name} {member.last_name}
          {isMe && (
            <span className="ml-1 text-sm text-muted-foreground">(you)</span>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
      </div>
      {canManage ? (
        <>
          <NativeSelect
            value={member.role}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate(
                {
                  organizationId: org.id,
                  membershipId: member.id,
                  data: { role: e.target.value as MemberResponse["role"] },
                },
                handlers
              )
            }
            aria-label={`Role of ${member.first_name}`}
          >
            {roles.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {ROLE_LABELS[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {(org.role === "owner" || member.role === "member") && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${member.first_name}`}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(
                  { organizationId: org.id, membershipId: member.id },
                  handlers
                )
              }
            >
              <Trash2 />
            </Button>
          )}
        </>
      ) : (
        <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
      )}
    </div>
  );
}

function InvitesCard() {
  const org = useOrg();
  const invalidate = useInvalidateOrg();
  const invites = useInviteList(org.id);
  const create = useInviteCreate();
  const revoke = useInviteRevoke();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [created, setCreated] = useState<InviteCreatedResponse | null>(null);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>
          Floppy doesn&apos;t send email. Create a link for each person and send
          it to them yourself. It only works for the email you enter, once, for
          14 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            aria-label="Email to invite"
          />
          <NativeSelect
            value={role}
            onChange={(e) =>
              setRole(e.target.value === "admin" ? "admin" : "member")
            }
            aria-label="Role"
          >
            <NativeSelectOption value="member">Member</NativeSelectOption>
            <NativeSelectOption value="admin">Admin</NativeSelectOption>
          </NativeSelect>
          <Button
            disabled={!email.includes("@") || create.isPending}
            onClick={() =>
              create.mutate(
                { organizationId: org.id, data: { email: email.trim(), role } },
                {
                  onSuccess: (invite) => {
                    setCreated(invite);
                    setEmail("");
                    void invalidate(org.id);
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                }
              )
            }
          >
            {create.isPending && <Spinner />}
            Create invite link
          </Button>
        </div>

        {created && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p>
              Link for <span className="font-medium">{created.email}</span>.
              Copy it now: it isn&apos;t shown again.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={created.invite_url}
                onFocus={(e) => e.target.select()}
                aria-label="Invite link"
              />
              <Button
                variant="outline"
                onClick={() => copy(created.invite_url)}
              >
                <Copy />
                Copy
              </Button>
            </div>
          </div>
        )}

        {(invites.data?.length ?? 0) > 0 && (
          <div className="divide-y rounded-lg border">
            {invites.data?.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-2 p-3 text-sm"
              >
                <span className="font-medium">{invite.email}</span>
                <Badge variant="outline">{ROLE_LABELS[invite.role]}</Badge>
                <span className="text-muted-foreground">
                  expires {formatDateTime(invite.expires_at)}
                </span>
                <Button
                  className="ml-auto"
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() =>
                    revoke.mutate(
                      { organizationId: org.id, inviteId: invite.id },
                      { onSuccess: () => void invalidate(org.id) }
                    )
                  }
                >
                  Cancel invite
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeaveCard() {
  const org = useOrg();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const leave = useOrganizationLeave();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave {org.name}</CardTitle>
        <CardDescription>
          You lose access to its plans and teams. Your past plans stay with the
          organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={leave.isPending}
            >
              Stay
            </Button>
            <Button
              variant="destructive"
              disabled={leave.isPending}
              onClick={() =>
                leave.mutate(
                  { organizationId: org.id },
                  {
                    onSuccess: () => {
                      void queryClient.invalidateQueries();
                      navigate({ to: "/welcome" });
                    },
                    onError: (error) => {
                      setConfirming(false);
                      toast.error(errorMessage(error));
                    },
                  }
                )
              }
            >
              Yes, leave
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            <LogOut />
            Leave organization
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
