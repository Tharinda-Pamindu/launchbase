import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  History,
  Inbox,
  LogOut,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { logout } from "@/api/endpoints/auth/auth";
import { useOrganizationList } from "@/api/endpoints/organizations/organizations";
import { useApprovalList } from "@/api/endpoints/plans/plans";
import { useCurrentUser } from "@/contexts/user-context";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

// `as const` keeps the hrefs as literal types, so TanStack Router can
// type-check them against the generated route tree.
const NAV_ITEMS = [
  { to: "/o/$orgId/week", label: "My week", icon: CalendarCheck },
  { to: "/o/$orgId/approvals", label: "Approvals", icon: Inbox },
  { to: "/o/$orgId/teams", label: "Teams", icon: Users },
  { to: "/o/$orgId/history", label: "My past weeks", icon: History },
  { to: "/o/$orgId/settings", label: "Organization", icon: Settings },
] as const;

const NAV_CLASS =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  // Called after any navigation, so the mobile sheet can close itself.
  onNavigate?: () => void;
}) {
  const { orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const orgs = useOrganizationList();
  const approvals = useApprovalList(orgId ?? "", {
    query: { enabled: Boolean(orgId) },
  });
  const waiting = approvals.data?.length ?? 0;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSettled: () => {
      // Drop every cached query so the next session starts clean, then leave.
      queryClient.clear();
      navigate({ to: "/login" });
    },
  });

  const initials =
    user &&
    `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();

  return (
    <aside
      className={cn(
        "h-full w-64 shrink-0 flex-col border-r bg-background",
        className ?? "flex"
      )}
    >
      <div className="flex h-16 items-center px-6">
        <Link to="/" aria-label="Floppy home" onClick={onNavigate}>
          <Logo className="h-7" />
        </Link>
      </div>

      {(orgs.data?.length ?? 0) > 0 && (
        <div className="px-3">
          <NativeSelect
            className="w-full"
            value={orgId ?? ""}
            onChange={(e) => {
              onNavigate?.();
              if (e.target.value === "new") {
                void navigate({ to: "/welcome" });
              } else {
                void navigate({
                  to: "/o/$orgId/week",
                  params: { orgId: e.target.value },
                });
              }
            }}
            aria-label="Organization"
          >
            {!orgId && (
              <NativeSelectOption value="">
                Choose an organization
              </NativeSelectOption>
            )}
            {orgs.data?.map((org) => (
              <NativeSelectOption
                key={org.id}
                value={org.id}
                disabled={org.is_suspended}
              >
                {org.name}
                {org.is_suspended ? " (suspended)" : ""}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="new">
              + New organization
            </NativeSelectOption>
          </NativeSelect>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {orgId ? (
          NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              params={{ orgId }}
              className={NAV_CLASS}
              onClick={onNavigate}
              activeProps={{ className: "bg-muted text-foreground" }}
            >
              <Icon className="size-4" />
              {label}
              {to === "/o/$orgId/approvals" && waiting > 0 && (
                <span className="ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground">
                  {waiting}
                </span>
              )}
            </Link>
          ))
        ) : (
          <Link
            to="/welcome"
            className={NAV_CLASS}
            onClick={onNavigate}
            activeProps={{ className: "bg-muted text-foreground" }}
          >
            <Plus className="size-4" />
            Start or join an organization
          </Link>
        )}
      </nav>

      <div className="border-t p-3">
        {user && (
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.first_name} {user.last_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start text-muted-foreground hover:text-foreground"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut className="size-4" />
          {logoutMutation.isPending ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </aside>
  );
}
