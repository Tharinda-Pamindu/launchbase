import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useOrganizationList } from "@/api/endpoints/organizations/organizations";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  formatDate,
  formatDateTime,
} from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;
type Status = "active" | "suspended";

export const Route = createFileRoute("/_main/organizations/")({
  validateSearch: (search: Record<string, unknown>): { status?: Status } => ({
    status:
      search["status"] === "active" || search["status"] === "suspended"
        ? search["status"]
        : undefined,
  }),
  component: Organizations,
});

function Organizations() {
  const { status } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const orgs = useOrganizationList({
    q: q.trim() || undefined,
    status,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const items = orgs.data?.items ?? [];
  const total = orgs.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every customer organization, how big it is and when it was last active."
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Search by name"
          aria-label="Search organizations"
          className="sm:max-w-xs"
        />
        <NativeSelect
          value={status ?? ""}
          onChange={(e) => {
            setPage(0);
            navigate({
              search: {
                status: (e.target.value || undefined) as Status | undefined,
              },
            });
          }}
          aria-label="Status"
        >
          <NativeSelectOption value="">All</NativeSelectOption>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="suspended">Suspended</NativeSelectOption>
        </NativeSelect>
      </div>

      {orgs.isError ? (
        <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />
      ) : !orgs.isLoading && items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations match"
          description={
            q || status
              ? "Try a different search or filter."
              : "Nobody has signed up yet."
          }
        />
      ) : (
        <div className="rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Teams</TableHead>
                <TableHead className="text-right">Plans</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : items.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <Link
                          to="/organizations/$orgId"
                          params={{ orgId: org.id }}
                          className="font-medium hover:underline"
                        >
                          {org.name}
                        </Link>
                        {org.suspended_at && (
                          <Badge variant="destructive" className="ml-2">
                            Suspended
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {org.member_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {org.team_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {org.plan_count}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(org.last_active_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(org.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "No organizations"
                : `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + items.length} of ${total}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
