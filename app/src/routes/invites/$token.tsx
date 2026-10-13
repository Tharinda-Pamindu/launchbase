import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "@/api/endpoints/auth/auth";
import {
  useInviteAccept,
  useInvitePreview,
} from "@/api/endpoints/invites/invites";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useUser } from "@/contexts/user-context";
import { rememberOrg } from "@/contexts/org-context";
import { errorMessage, errorStatus } from "@/lib/errors";

export const Route = createFileRoute("/invites/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: userLoading } = useUser();
  const preview = useInvitePreview(token, { query: { retry: false } });
  const accept = useInviteAccept();
  const signOut = useMutation({
    mutationFn: () => logout(),
    // Refetch the session so the page re-renders signed out.
    onSettled: () => queryClient.resetQueries(),
  });
  const here = `/invites/${token}`;

  if (preview.isLoading || userLoading) {
    return (
      <AuthLayout title="Opening your invite" description="One moment…">
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthLayout>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <AuthLayout
        title="This invite link doesn't work"
        description={
          errorStatus(preview.error) === 404
            ? "Check that you copied the whole link, or ask for a new one."
            : errorMessage(preview.error)
        }
      >
        <Link to="/" className={buttonVariants({ className: "w-full" })}>
          Go to Floppy
        </Link>
      </AuthLayout>
    );
  }

  const invite = preview.data;
  const title = `Join ${invite.organization_name}`;
  const who = invite.invited_by
    ? `${invite.invited_by} invited`
    : "You've been invited";

  if (invite.status !== "pending") {
    const reason = {
      accepted: "This invite has already been used.",
      revoked: "This invite was cancelled.",
      expired: "This invite has expired.",
    }[invite.status];
    return (
      <AuthLayout
        title={title}
        description={`${reason} Ask for a new link if you still need one.`}
      >
        <Link to="/" className={buttonVariants({ className: "w-full" })}>
          Go to Floppy
        </Link>
      </AuthLayout>
    );
  }

  const description = `${who} ${invite.email} to plan weeks with ${invite.organization_name} as ${
    invite.role === "admin" ? "an admin" : "a member"
  }.`;

  if (!user) {
    return (
      <AuthLayout title={title} description={description}>
        <div className="space-y-3">
          <Link
            to="/signup"
            search={{ redirect: here, email: invite.email }}
            className={buttonVariants({ className: "h-11 w-full" })}
          >
            Create an account
          </Link>
          <Link
            to="/login"
            search={{ redirect: here, email: invite.email }}
            className={buttonVariants({
              variant: "outline",
              className: "h-11 w-full",
            })}
          >
            I already have an account
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <AuthLayout
        title={title}
        description={`This invite is for ${invite.email}, but you're signed in as ${user.email}.`}
      >
        <Button
          className="h-11 w-full"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Sign out and switch account
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={title} description={description}>
      <div className="space-y-3">
        <Button
          className="h-11 w-full"
          disabled={accept.isPending}
          onClick={() =>
            accept.mutate(
              { token },
              {
                onSuccess: (org) => {
                  rememberOrg(org.id);
                  queryClient.invalidateQueries();
                  navigate({ to: "/o/$orgId/week", params: { orgId: org.id } });
                },
              }
            )
          }
        >
          {accept.isPending && <Spinner />}
          Accept and join
        </Button>
        {accept.isError && (
          <p className="text-center text-sm text-destructive">
            {errorMessage(accept.error)}
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
